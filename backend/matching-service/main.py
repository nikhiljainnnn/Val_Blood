"""
RakSetu Matching Service
- 12-antigen compatibility scoring
- Guardian Circle management
- GNN-based donor ranking
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime
import uuid

# Load secrets from SSM Parameter Store before initializing anything else
from shared.ssm_loader import load_ssm_parameters
load_ssm_parameters()

from shared.db import get_db, init_db
from shared.models import (
    Patient, Donor, Person, AntigenProfile,
    GuardianCircle, TransfusionRequest
)
from shared.schemas import (
    TransfusionRequestIn, TransfusionRequestOut,
    GuardianCircleOut, DonorMatchResult, CompatibilityResult,
    Urgency, DonorStatus, Language
)
from compatibility import compute_compatibility, to_antigen_dataclass
from guardian_circle import GuardianCircleManager
from gnn_model import GNNRanker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("matching-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.gnn   = GNNRanker()
    app.state.gc_mgr = GuardianCircleManager()
    logger.info("Matching service started")
    yield


app = FastAPI(title="RakSetu Matching Service", version="1.0.0", lifespan=lifespan)


@app.post("/match/request", response_model=TransfusionRequestOut)
async def create_match_request(
    body: TransfusionRequestIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a transfusion request and immediately match from Guardian Circle.
    Falls back to broader pool if circle exhausted.
    """
    # Verify patient exists
    patient_result = await db.execute(
        select(Patient).where(Patient.id == body.patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Create request record
    req = TransfusionRequest(
        id=str(uuid.uuid4()),
        patient_id=body.patient_id,
        hospital_id=body.hospital_id,
        urgency=body.urgency,
        units_needed=body.units_needed,
        hb_at_request=body.hb_at_request,
        notes=body.notes,
        status="matched",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    # Match donors from Guardian Circle
    gc_mgr = app.state.gc_mgr
    matched = await gc_mgr.get_available_donors(
        patient_id=body.patient_id,
        urgency=body.urgency,
        db=db,
    )

    # Background: trigger notifications (calls notification-service)
    background.add_task(_trigger_notifications, req.id, matched, body.urgency)

    return TransfusionRequestOut(
        id=req.id,
        patient_id=req.patient_id,
        status=req.status,
        urgency=req.urgency,
        matched_donors=matched,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@app.get("/guardian-circle/{patient_id}", response_model=GuardianCircleOut)
async def get_guardian_circle(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GuardianCircle, Donor, Person, AntigenProfile)
        .join(Donor, GuardianCircle.donor_id == Donor.id)
        .join(Person, Donor.person_id == Person.id)
        .join(AntigenProfile, AntigenProfile.person_id == Person.id)
        .where(
            and_(
                GuardianCircle.patient_id == patient_id,
                GuardianCircle.status != "churned"
            )
        )
        .order_by(GuardianCircle.rank_in_circle)
    )
    rows = result.all()
    if not rows:
        raise HTTPException(status_code=404, detail="No guardian circle found for patient")

    # Get patient name
    p_result = await db.execute(
        select(Person).join(Patient, Patient.person_id == Person.id)
        .where(Patient.id == patient_id)
    )
    patient_person = p_result.scalar_one_or_none()

    donors = []
    for gc, donor, person, profile in rows:
        donors.append(DonorMatchResult(
            donor_id=donor.id,
            donor_name=person.name,
            phone=person.phone,
            language=Language(person.language),
            compatibility=CompatibilityResult(
                score=gc.compatibility_score,
                mismatches=[],
                mismatch_count=gc.antigen_mismatches,
                compatible=gc.antigen_mismatches == 0,
                risk_level="safe" if gc.antigen_mismatches == 0 else
                           "caution" if gc.antigen_mismatches <= 2 else "incompatible",
            ),
            churn_probability=gc.churn_risk,
            availability_prob=max(0.0, 1.0 - gc.churn_risk),
            days_to_eligible=max(0, 56 - (
                (datetime.utcnow() - donor.last_donation_at).days
                if donor.last_donation_at else 999
            )),
            rank=gc.rank_in_circle,
            status=DonorStatus(gc.status),
        ))

    avg_compat = sum(d.compatibility.score for d in donors) / len(donors) if donors else 0.0
    at_risk = sum(1 for d in donors if d.churn_probability > 0.6)

    return GuardianCircleOut(
        patient_id=patient_id,
        patient_name=patient_person.name if patient_person else "Unknown",
        circle_size=len(donors),
        avg_compatibility=round(avg_compat, 3),
        at_risk_count=at_risk,
        donors=donors,
    )


import os

@app.post("/guardian-circle/build/{patient_id}")
async def build_guardian_circle(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Build or rebuild a patient's Guardian Circle.
    Runs full GNN scoring across all verified donors.
    """
    # Always build the circle with the GNN!
    gc_mgr = app.state.gc_mgr
    gnn    = app.state.gnn
    result = await gc_mgr.build_circle(patient_id, gnn, db)
    return {"patient_id": patient_id, "circle_size": result, "status": "built"}


@app.post("/guardian-circle/refresh-churn")
async def refresh_churn_scores(db: AsyncSession = Depends(get_db)):
    """
    Refresh churn risk scores for all active Guardian Circle donors.
    Called daily by scheduler.
    """
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "http://prediction-service:8002/churn/batch",
            timeout=60.0
        )
    predictions = resp.json().get("predictions", [])

    updated = 0
    for pred in predictions:
        await db.execute(
            GuardianCircle.__table__.update()
            .where(GuardianCircle.donor_id == pred["donor_id"])
            .values(churn_risk=pred["churn_probability"],
                    status=_risk_to_status(pred["churn_probability"]))
        )
        updated += 1

    await db.commit()
    return {"updated": updated}


def _risk_to_status(prob: float) -> str:
    if prob < 0.4:  return "active"
    if prob < 0.7:  return "at_risk"
    return "churned"


async def _trigger_notifications(request_id: str, donors: list, urgency: str):
    """Background task — calls notification service."""
    import httpx
    for donor in donors[:3]:   # notify top 3
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "http://notification-service:8003/notify/donor",
                    json={
                        "donor_id":  donor.donor_id,
                        "request_id": request_id,
                        "urgency":   urgency,
                        "language":  donor.language,
                    },
                    timeout=10.0,
                )
        except Exception as e:
            logger.error(f"Notification trigger failed for donor {donor.donor_id}: {e}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "matching-service"}
