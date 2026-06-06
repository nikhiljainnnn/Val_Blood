"""
RakSetu Prediction Service
- Donor churn prediction (XGBoost)
- Hb-drop forecasting (LSTM)
- Surge alerts
"""
import os
import json
import pickle
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from shared.db import get_db, init_db
from shared.models import Donor, Person, DonorSignal, TransfusionEvent, Patient, GuardianCircle
from shared.redis_client import get_redis
from churn_model import DonorChurnPredictor
from hb_forecaster import HbDropForecaster

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


@app.post("/signal/record")
async def record_donor_signal(body: dict, db: AsyncSession = Depends(get_db)):
    """Record a behavioral signal for a donor."""
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
    return {"ok": True}


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
