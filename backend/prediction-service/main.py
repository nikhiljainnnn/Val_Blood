"""
RakSetu Prediction Service
- Donor churn prediction (XGBoost)
- Hb-drop forecasting (LSTM)
- Surge alerts
- UPGRADE 4: One-time → Regular conversion model (GET /conversion/candidates)
- AGENT support: GET /donor/context/{donor_id} (upgrade3 conversation memory)
"""
import os
import sys
import json
import pickle
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func
import math

# Load secrets from SSM Parameter Store before initializing anything else
from shared.ssm_loader import load_ssm_parameters
load_ssm_parameters()

from shared.db import get_db, init_db
from shared.models import Donor, Person, DonorSignal, TransfusionEvent, Patient, GuardianCircle, TransfusionRequest
from shared.redis_client import get_redis
from churn_model import DonorChurnPredictor
from hb_forecaster import HbDropForecaster

# ── Upgrade wiring ────────────────────────────────────────────────────────
_LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), 'lambdas')
if not os.path.exists(_LAMBDAS_DIR):
    _LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), '..', 'lambdas')
sys.path.insert(0, _LAMBDAS_DIR)
from upgrade4_conversion_model import router as conversion_router  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prediction-service")

redis = get_redis()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.churn_model = DonorChurnPredictor()
    app.state.hb_model    = HbDropForecaster()
    logger.info("Prediction service started")
    yield


app = FastAPI(title="RakSetu Prediction Service", version="1.0.0", lifespan=lifespan)

# ── Mount upgrade routers ────────────────────────────────────────────────────────
app.include_router(conversion_router)  # GET /conversion/candidates, POST /conversion/assign


# ── Agent support: donor context endpoint (calls upgrade3 conversation memory) ───────────
@app.get("/donor/context/{donor_id}")
async def get_donor_context(donor_id: str):
    """
    Used by agent orchestrator tool: get_donor_context.
    Returns structured summary of the donor's full interaction history.
    """
    from upgrade3_conversation_memory import get_donor_summary
    return get_donor_summary(donor_id)


@app.get("/churn/batch")
async def predict_churn_batch(db: AsyncSession = Depends(get_db)):
    """
    Predict churn probability for all active Guardian Circle donors.
    Results cached 6h in Redis.
    """
    cache_key = "churn:batch:latest"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # Get all unique active donors from guardian circles
    result = await db.execute(
        select(GuardianCircle.donor_id).distinct()
        .where(GuardianCircle.status.in_(["active", "at_risk"]))
    )
    donor_ids = [row[0] for row in result.all()]

    if not donor_ids:
        return {"predictions": [], "total_at_risk": 0, "computed_at": datetime.utcnow().isoformat()}

    predictor = app.state.churn_model
    probs     = await predictor.predict_batch(donor_ids, db)

    predictions = []
    for donor_id, prob in probs.items():
        tier = _risk_tier(prob)
        predictions.append({
            "donor_id":          donor_id,
            "churn_probability": round(prob, 4),
            "risk_tier":         tier,
            "key_signals":       _key_signals(prob),
            "recommended_action": _recommend(tier),
            "predicted_at":      datetime.utcnow().isoformat(),
        })

    predictions.sort(key=lambda x: x["churn_probability"], reverse=True)
    at_risk = sum(1 for p in predictions if p["churn_probability"] > 0.6)

    response = {
        "predictions":   predictions,
        "total_at_risk": at_risk,
        "computed_at":   datetime.utcnow().isoformat(),
    }
    await redis.setex(cache_key, 21600, json.dumps(response))   # 6h cache
    return response


@app.get("/churn/donor/{donor_id}")
async def predict_churn_single(donor_id: str, db: AsyncSession = Depends(get_db)):
    """Single donor churn prediction with explanation."""
    predictor = app.state.churn_model
    probs     = await predictor.predict_batch([donor_id], db)

    if donor_id not in probs:
        raise HTTPException(status_code=404, detail="Donor not found or insufficient data")

    prob = probs[donor_id]
    tier = _risk_tier(prob)

    return {
        "donor_id":          donor_id,
        "churn_probability": round(prob, 4),
        "risk_tier":         tier,
        "key_signals":       _key_signals(prob),
        "recommended_action": _recommend(tier),
        "predicted_at":      datetime.utcnow().isoformat(),
    }


@app.get("/hb-forecast/{patient_id}")
async def forecast_hb(patient_id: str, db: AsyncSession = Depends(get_db)):
    """Predict days until next transfusion needed for a patient."""
    cache_key = f"hb:forecast:{patient_id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    forecaster = app.state.hb_model
    result     = await forecaster.predict(patient_id, db)

    if result is None:
        raise HTTPException(status_code=404, detail="Insufficient transfusion history")

    await redis.setex(cache_key, 3600, json.dumps(result))  # 1h cache
    return result


@app.get("/hb-forecast/batch/all")
async def forecast_hb_batch(db: AsyncSession = Depends(get_db)):
    """Forecast Hb for all active patients — used for proactive alerts."""
    result = await db.execute(select(Patient.id))
    patient_ids = [row[0] for row in result.all()]

    forecaster = app.state.hb_model
    forecasts  = []
    for pid in patient_ids:
        try:
            f = await forecaster.predict(pid, db)
            if f and f["predicted_days_to_threshold"] <= 10:
                f["urgency_flag"] = True
                forecasts.append(f)
        except Exception:
            pass

    return {
        "urgent_patients": forecasts,
        "count":           len(forecasts),
        "computed_at":     datetime.utcnow().isoformat(),
    }


@app.get("/churn/at-risk-bridge")
async def get_at_risk_bridge_donors(db: AsyncSession = Depends(get_db)):
    """
    Returns inactive Bridge Donors (matched but not donating).
    Now driven by real database queries!
    """
    # Count total at risk
    result = await db.execute(select(func.count()).select_from(GuardianCircle).where(GuardianCircle.status == "at_risk"))
    total_at_risk = result.scalar() or 0

    # Get top 3 for activation
    query = (
        select(GuardianCircle, Donor, Person)
        .join(Donor, Donor.id == GuardianCircle.donor_id)
        .join(Person, Person.id == Donor.person_id)
        .where(GuardianCircle.status == "at_risk")
        .order_by(GuardianCircle.churn_risk.desc())
        .limit(3)
    )
    result = await db.execute(query)
    rows = result.all()
    
    top_3 = []
    for gc, donor, person in rows:
        top_3.append({
            "donor_id": donor.id,
            "person_name": person.name,
            "blood_group": "O+",  # Simplified
            "churn_risk": gc.churn_risk,
            "gc_status": gc.status
        })

    return {
        "total_at_risk":        total_at_risk,
        "headline":             f"{total_at_risk} matched donors are at risk of dropping out.",
        "top_3_for_activation": top_3,
        "demo_line":            "Here are the 3 we are activating right now.",
        "computed_at":          datetime.utcnow().isoformat(),
    }


@app.get("/patients/urgent")
async def get_urgent_patients(db: AsyncSession = Depends(get_db)):
    """
    Returns patients needing transfusion in <=7 days.
    Now queries live from the TransfusionRequest table.
    """
    result = await db.execute(
        select(TransfusionRequest, Patient, Person)
        .join(Patient, Patient.id == TransfusionRequest.patient_id)
        .join(Person, Person.id == Patient.person_id)
        .where(TransfusionRequest.status == "open")
        .where(TransfusionRequest.urgency.in_(["urgent", "critical"]))
    )
    rows = result.all()
    
    patients = []
    for req, patient, person in rows:
        patients.append({
            "patient_id": patient.id,
            "patient_name": person.name,
            "blood_group": "O+",
            "city": person.city or "Hyderabad",
            "urgency": req.urgency,
            "quantity_required": req.units_needed
        })

    return {
        "urgent_count": len(patients),
        "headline":     f"{len(patients)} urgent cases identified automatically.",
        "patients":     patients,
        "computed_at":  datetime.utcnow().isoformat(),
    }


@app.get("/demo/summary")
async def get_demo_summary(db: AsyncSession = Depends(get_db)):
    """Top-line numbers for the dashboard, now calculated live!"""
    p_res = await db.execute(select(func.count()).select_from(Patient))
    total_patients = p_res.scalar() or 0
    
    d_res = await db.execute(select(func.count()).select_from(Donor))
    total_donors = d_res.scalar() or 0
    
    tr_res = await db.execute(select(func.count()).select_from(TransfusionRequest).where(TransfusionRequest.status == "open"))
    total_requests = tr_res.scalar() or 0
    
    gc_res = await db.execute(select(func.count()).select_from(GuardianCircle).where(GuardianCircle.status == "at_risk"))
    total_at_risk = gc_res.scalar() or 0

    return {
        "total_patients": total_patients,
        "total_donors": total_donors,
        "total_bridge_donors": total_donors,
        "at_risk_bridge_donors": total_at_risk,
        "urgent_patients": total_requests,
        "last_updated": datetime.utcnow().isoformat()
    }


@app.post("/signal/record")
async def record_donor_signal(body: dict, db: AsyncSession = Depends(get_db)):
    """Record a behavioral signal for a donor. Also pushes to Kinesis for real-time churn update."""
    signal = DonorSignal(
        donor_id=body["donor_id"],
        signal_type=body["signal_type"],
        value=body.get("value", {}),
        ts=datetime.utcnow(),
    )
    db.add(signal)
    await db.commit()

    # Invalidate cached features
    await redis.delete(f"features:{body['donor_id']}")
    await redis.delete("churn:batch:latest")

    # Push to Kinesis for real-time churn model input update
    try:
        import boto3
        kinesis = boto3.client("kinesis", region_name=os.getenv("AWS_REGION", "us-east-1"))
        kinesis.put_record(
            StreamName="raksetu-donor-signals",
            Data=json.dumps({
                "donor_id":   body["donor_id"],
                "signal":     body["signal_type"],
                "ts":         datetime.utcnow().isoformat(),
            }),
            PartitionKey=body["donor_id"],
        )
    except Exception as e:
        logger.warning(f"Kinesis push skipped: {e}")

    # Push to SQS cascade queue (async task buffer per architecture)
    queue_url = os.getenv("CASCADE_QUEUE_URL", "")
    if queue_url and body.get("signal_type") in ("missed_donation", "no_response", "churn_risk_high"):
        try:
            import boto3
            sqs = boto3.client("sqs", region_name=os.getenv("AWS_REGION", "us-east-1"))
            sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=json.dumps({
                    "donor_id":       body["donor_id"],
                    "signal_type":    body["signal_type"],
                    "churn_risk":     body.get("value", {}).get("churn_risk", 0.8),
                    "blood_group":    body.get("value", {}).get("blood_group", ""),
                    "trigger_reason": body.get("value", {}).get("trigger_reason",
                                              "Very limited activity despite multiple calls"),
                    "language":       body.get("value", {}).get("language", "hi"),
                    "ts":             datetime.utcnow().isoformat(),
                }),
                MessageGroupId=body["donor_id"] if queue_url.endswith(".fifo") else None,
            )
            logger.info(f"SQS cascade queued for donor: {body['donor_id']}")
        except Exception as e:
            logger.warning(f"SQS push skipped: {e}")

    # Write to DynamoDB (sessions + signals, as per architecture Layer 5)
    try:
        import boto3
        dynamodb = boto3.client("dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1"))
        dynamodb.put_item(
            TableName="raksetu-donor-signals",
            Item={
                "donor_id":    {"S": body["donor_id"]},
                "timestamp":   {"S": datetime.utcnow().isoformat()},
                "signal_type": {"S": body.get("signal_type", "unknown")},
                "value":       {"S": json.dumps(body.get("value", {}))},
            }
        )
    except Exception as e:
        logger.warning(f"DynamoDB signal write skipped: {e}")

    return {"ok": True, "queued_for_cascade": bool(queue_url)}


def _risk_tier(prob: float) -> str:
    if prob < 0.30:  return "low"
    if prob < 0.55:  return "medium"
    if prob < 0.75:  return "high"
    return "critical"


def _key_signals(prob: float) -> list[str]:
    # In production: extracted from SHAP values
    if prob < 0.3:
        return ["Regular donation pattern", "High message response rate"]
    if prob < 0.6:
        return ["Declining message response", "Extended interval since last donation"]
    return ["No donation in 90+ days", "Messages unanswered", "Possible relocation detected"]


def _recommend(tier: str) -> str:
    return {
        "low":      "Maintain standard monthly check-in",
        "medium":   "Send personalized patient story in next 7 days",
        "high":     "Priority outreach: voice call + WhatsApp within 48h",
        "critical": "Immediate coordinator contact + circle replacement required",
    }.get(tier, "Monitor")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "prediction-service"}
