"""
RakSetu Story Engine — Amazon Bedrock edition
Replaces Gemini with Nova Lite (multilingual) / Nova Micro (cheapest fallback).
Everything else identical to original.
"""
import os
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from shared.db import get_db, init_db
from shared.models import PatientMilestone, Donor, Patient, GuardianCircle
from shared.redis_client import get_redis
from bedrock_client import generate_story, _fallback_story

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("story-engine")
redis  = get_redis()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Story engine started (Bedrock backend)")
    yield


app = FastAPI(title="RakSetu Story Engine", version="2.0.0", lifespan=lifespan)


@app.get("/story/{donor_id}/{patient_id}")
async def get_donor_story(
    donor_id:   str,
    patient_id: str,
    language:   str = "hi",
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"story:{donor_id}:{patient_id}:{language}"
    cached    = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    donation_number = await _get_donation_number(donor_id, db)
    milestone       = await _get_milestone(patient_id, db)

    # Use Nova Lite for multilingual, Nova Micro for English-only (saves cost)
    use_lite = language != "en"

    if milestone:
        story_text = await generate_story(
            milestone=milestone["description"],
            donation_number=donation_number,
            language=language,
            use_lite=use_lite,
        )
    else:
        story_text = _fallback_story(donation_number, language)

    result = {
        "donor_id":        donor_id,
        "patient_id":      patient_id,
        "story_text":      story_text,
        "language":        language,
        "donation_number": donation_number,
        "model_used":      "nova-lite" if use_lite else "nova-micro",
        "generated_at":    datetime.utcnow().isoformat(),
    }

    await redis.setex(cache_key, 3600, json.dumps(result))
    return result


@app.post("/milestone/record")
async def record_milestone(body: dict, db: AsyncSession = Depends(get_db)):
    if not body.get("share_consent", False):
        raise HTTPException(400, "Requires explicit family consent")

    milestone = PatientMilestone(
        patient_id=body["patient_id"],
        milestone_type=body.get("milestone_type", "general"),
        description=body["description"],
        share_consent=True,
        recorded_at=datetime.utcnow(),
    )
    db.add(milestone)
    await db.commit()

    keys = await redis.keys(f"story:*:{body['patient_id']}:*")
    if keys:
        await redis.delete(*keys)

    return {"id": milestone.id, "status": "recorded"}


async def _get_donation_number(donor_id: str, db: AsyncSession) -> int:
    result = await db.execute(select(Donor).where(Donor.id == donor_id))
    donor  = result.scalar_one_or_none()
    return max(1, donor.lifetime_donations) if donor else 1


async def _get_milestone(patient_id: str, db: AsyncSession) -> dict | None:
    result = await db.execute(
        select(PatientMilestone)
        .where(
            PatientMilestone.patient_id    == patient_id,
            PatientMilestone.share_consent == True,
        )
        .order_by(PatientMilestone.recorded_at.desc())
        .limit(1)
    )
    m = result.scalar_one_or_none()
    if not m:
        return None
    return {"id": m.id, "type": m.milestone_type, "description": m.description}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "story-engine", "llm": "amazon-bedrock"}
