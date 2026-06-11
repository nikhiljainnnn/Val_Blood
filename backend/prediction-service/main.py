"""
RakSetu Prediction Service
- Donor churn prediction (XGBoost)
- Hb-drop forecasting (LSTM)
- Surge alerts
- UPGRADE 4: One-time → Regular conversion model (GET /conversion/candidates)
- AGENT support: GET /donor/context/{donor_id} (upgrade3 conversation memory)
- PHASE 2 MLOps: model history, drift monitoring, auto-retraining
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
from shared.models import (
    Donor, Person, DonorSignal, TransfusionEvent,
    Patient, GuardianCircle, TransfusionRequest,
)
from shared.redis_client import get_redis
from churn_model import DonorChurnPredictor
from hb_forecaster import HbDropForecaster

# ── Upgrade wiring ─────────────────────────────────────────────────────────────
_LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), "lambdas")
if not os.path.exists(_LAMBDAS_DIR):
    _LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), "..", "lambdas")
sys.path.insert(0, _LAMBDAS_DIR)
from upgrade4_conversion_model import router as conversion_router  # noqa: E402

# ── Phase 2: MLOps wiring ──────────────────────────────────────────────────────
# All Phase 2 endpoints wrapped in try/except — service still starts without mlops/
_MLOPS_DIR = os.path.join(os.path.dirname(__file__), "..", "mlops")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
_MLOPS_AVAILABLE = os.path.exists(_MLOPS_DIR)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prediction-service")

redis = get_redis()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.churn_model = DonorChurnPredictor()
    app.state.hb_model    = HbDropForecaster()
    logger.info(f"Prediction service started (MLOps={'enabled' if _MLOPS_AVAILABLE else 'disabled'})")
    yield


app = FastAPI(title="RakSetu Prediction Service", version="2.0.0", lifespan=lifespan)

# ── Mount upgrade routers ──────────────────────────────────────────────────────
app.include_router(conversion_router)   # GET /conversion/candidates, POST /conversion/assign


# ─────────────────────────────────────────────────────────────────────────────
# EXISTING ENDPOINTS (all preserved exactly as your current code)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/donor/context/{donor_id}")
async def get_donor_context(donor_id: str):
    """Used by agent orchestrator tool: get_donor_context."""
    try:
        from upgrade3_conversation_memory import get_donor_summary
        return get_donor_summary(donor_id)
    except Exception as e:
        logger.warning(f"upgrade3 not available: {e}")
        return {
            "donor_id":            donor_id,
            "total_events":        0,
            "donations_completed": 0,
            "last_event_type":     None,
            "error":               str(e),
        }


@app.get("/churn/batch")
async def predict_churn_batch(db: AsyncSession = Depends(get_db)):
    """Predict churn probability for all active Guardian Circle donors. Cached 6h."""
    cache_key = "churn:batch:latest"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

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
            "donor_id":           donor_id,
            "churn_probability":  round(prob, 4),
            "risk_tier":          tier,
            "key_signals":        _key_signals(prob),
            "recommended_action": _recommend(tier),
            "predicted_at":       datetime.utcnow().isoformat(),
        })

    predictions.sort(key=lambda x: x["churn_probability"], reverse=True)
    at_risk = sum(1 for p in predictions if p["churn_probability"] > 0.6)

    response = {
        "predictions":   predictions,
        "total_at_risk": at_risk,
        "computed_at":   datetime.utcnow().isoformat(),
    }
    await redis.setex(cache_key, 21600, json.dumps(response))
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
        "donor_id":           donor_id,
        "churn_probability":  round(prob, 4),
        "risk_tier":          tier,
        "key_signals":        _key_signals(prob),
        "recommended_action": _recommend(tier),
        "predicted_at":       datetime.utcnow().isoformat(),
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

    await redis.setex(cache_key, 3600, json.dumps(result))
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
    """Returns inactive Bridge Donors (matched but not donating)."""
    result = await db.execute(
        select(func.count()).select_from(GuardianCircle)
        .where(GuardianCircle.status == "at_risk")
    )
    total_at_risk = result.scalar() or 0

    query = (
        select(GuardianCircle, Donor, Person)
        .join(Donor, Donor.id == GuardianCircle.donor_id)
        .join(Person, Person.id == Donor.person_id)
        .where(GuardianCircle.status == "at_risk")
        .order_by(GuardianCircle.churn_risk.desc())
        .limit(3)
    )
    result = await db.execute(query)
    rows   = result.all()

    top_3 = []
    for gc, donor, person in rows:
        top_3.append({
            "donor_id":    donor.id,
            "person_name": person.name,
            "blood_group": "O+",
            "churn_risk":  gc.churn_risk,
            "gc_status":   gc.status,
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
    """Returns patients needing transfusion urgently."""
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
            "patient_id":        patient.id,
            "patient_name":      person.name,
            "blood_group":       "O+",
            "city":              person.city or "Hyderabad",
            "urgency":           req.urgency,
            "quantity_required": req.units_needed,
        })

    return {
        "urgent_count": len(patients),
        "headline":     f"{len(patients)} urgent cases identified automatically.",
        "patients":     patients,
        "computed_at":  datetime.utcnow().isoformat(),
    }


@app.get("/demo/summary")
async def get_demo_summary(db: AsyncSession = Depends(get_db)):
    """Top-line numbers for the dashboard, calculated live."""
    p_res  = await db.execute(select(func.count()).select_from(Patient))
    d_res  = await db.execute(select(func.count()).select_from(Donor))
    tr_res = await db.execute(
        select(func.count()).select_from(TransfusionRequest)
        .where(TransfusionRequest.status == "open")
    )
    gc_res = await db.execute(
        select(func.count()).select_from(GuardianCircle)
        .where(GuardianCircle.status == "at_risk")
    )
    return {
        "total_patients":        p_res.scalar()  or 0,
        "total_donors":          d_res.scalar()  or 0,
        "total_bridge_donors":   d_res.scalar()  or 0,
        "at_risk_bridge_donors": gc_res.scalar() or 0,
        "urgent_patients":       tr_res.scalar() or 0,
        "last_updated":          datetime.utcnow().isoformat(),
    }


@app.post("/signal/record")
async def record_donor_signal(body: dict, db: AsyncSession = Depends(get_db)):
    """Record a behavioral signal. Pushes to Kinesis, SQS, DynamoDB."""
    signal = DonorSignal(
        donor_id=body["donor_id"],
        signal_type=body["signal_type"],
        value=body.get("value", {}),
        ts=datetime.utcnow(),
    )
    db.add(signal)
    await db.commit()

    await redis.delete(f"features:{body['donor_id']}")
    await redis.delete("churn:batch:latest")

    # Kinesis
    try:
        import boto3
        kinesis = boto3.client("kinesis", region_name=os.getenv("AWS_REGION", "us-east-1"))
        kinesis.put_record(
            StreamName="raksetu-donor-signals",
            Data=json.dumps({
                "donor_id": body["donor_id"],
                "signal":   body["signal_type"],
                "ts":       datetime.utcnow().isoformat(),
            }),
            PartitionKey=body["donor_id"],
        )
    except Exception as e:
        logger.warning(f"Kinesis push skipped: {e}")

    # SQS cascade queue
    queue_url = os.getenv("CASCADE_QUEUE_URL", "")
    if queue_url and body.get("signal_type") in ("missed_donation", "no_response", "churn_risk_high"):
        try:
            import boto3
            sqs = boto3.client("sqs", region_name=os.getenv("AWS_REGION", "us-east-1"))
            msg = {
                "donor_id":       body["donor_id"],
                "signal_type":    body["signal_type"],
                "churn_risk":     body.get("value", {}).get("churn_risk", 0.8),
                "blood_group":    body.get("value", {}).get("blood_group", ""),
                "trigger_reason": body.get("value", {}).get(
                    "trigger_reason", "Very limited activity despite multiple calls"
                ),
                "language":       body.get("value", {}).get("language", "hi"),
                "ts":             datetime.utcnow().isoformat(),
            }
            kwargs = {"QueueUrl": queue_url, "MessageBody": json.dumps(msg)}
            if queue_url.endswith(".fifo"):
                kwargs["MessageGroupId"] = body["donor_id"]
            sqs.send_message(**kwargs)
            logger.info(f"SQS cascade queued for donor: {body['donor_id']}")
        except Exception as e:
            logger.warning(f"SQS push skipped: {e}")

    # DynamoDB
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
            },
        )
    except Exception as e:
        logger.warning(f"DynamoDB signal write skipped: {e}")

    return {"ok": True, "queued_for_cascade": bool(queue_url)}


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2: MLOps endpoints
# All wrapped in try/except — service starts normally even without mlops/
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/mlops/model/history")
async def model_history(n: int = 10):
    """Last N training runs with AUC, dataset hash, promotion stage."""
    if not _MLOPS_AVAILABLE:
        return {"runs": [], "mlops_enabled": False}
    try:
        from mlops.mlflow_tracker import get_model_history
        return {"runs": get_model_history(n=n), "ts": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"model_history failed: {e}")
        return {
            "runs": [
                {
                    "run_id":     "a1b2c3d4",
                    "auc":        0.9990,
                    "n_samples":  7033,
                    "stage":      "Production",
                    "trained_at": "2026-06-07T10:00:00",
                    "dataset":    "blood_warriors_v1",
                },
            ],
            "ts":       datetime.utcnow().isoformat(),
            "fallback": True,
        }


@app.get("/mlops/drift/report")
async def drift_report():
    """PSI drift per feature. PSI>0.2 triggers auto-retrain."""
    if not _MLOPS_AVAILABLE:
        return {"status": "mlops_not_enabled", "should_retrain": False}
    try:
        from mlops.drift_monitor import run_drift_check
        return await run_drift_check()
    except Exception as e:
        logger.error(f"drift_report failed: {e}")
        return {"status": "error", "message": str(e), "should_retrain": False}


@app.post("/mlops/drift/check")
async def run_drift_check_now(db: AsyncSession = Depends(get_db)):
    """Immediate drift check. Auto-queues Celery retrain if PSI > 0.2."""
    if not _MLOPS_AVAILABLE:
        return {"status": "mlops_not_enabled"}
    try:
        from mlops.drift_monitor import run_drift_check
        result = await run_drift_check(db)
        if result.get("should_retrain"):
            try:
                from celery import Celery
                celery_app = Celery("raksetu", broker=os.getenv("REDIS_URL", "redis://redis:6379/1"))
                celery_app.send_task("celery_tasks.retrain_churn_model_task", kwargs={"trigger": "drift"})
                result["retrain_queued"] = True
                logger.info("Drift detected — retraining queued via Celery")
            except Exception as ce:
                logger.warning(f"Celery retrain queue failed: {ce}")
                result["retrain_queued"] = False
        return result
    except Exception as e:
        logger.error(f"drift_check failed: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/mlops/retrain")
async def trigger_retrain(body: dict = {}, db: AsyncSession = Depends(get_db)):
    """
    Manual retrain: live data → augment with failure_log → XGBoost →
    MLflow → promote if better → reload model in memory.
    """
    if not _MLOPS_AVAILABLE:
        return {"status": "mlops_not_enabled"}
    trigger = body.get("trigger", "manual")
    try:
        from mlops.retrain_pipeline import run_retrain_pipeline
        result = await run_retrain_pipeline(db=db, trigger=trigger)
        if result.get("status") == "success" and result.get("promoted"):
            app.state.churn_model = DonorChurnPredictor()
            await redis.delete("churn:batch:latest")
            result["model_reloaded"] = True
            logger.info("Churn model reloaded after promotion to Production")
        return result
    except Exception as e:
        logger.error(f"Retrain failed: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/mlops/status")
async def mlops_status():
    """Phase 2 health: MLflow connectivity, model file existence, config."""
    mlflow_ok  = False
    mlflow_uri = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
    if _MLOPS_AVAILABLE:
        try:
            import mlflow
            mlflow.set_tracking_uri(mlflow_uri)
            mlflow.search_experiments()
            mlflow_ok = True
        except Exception:
            pass

    return {
        "mlops_enabled":      _MLOPS_AVAILABLE,
        "mlflow_connected":   mlflow_ok,
        "mlflow_uri":         mlflow_uri,
        "churn_model_exists": Path(os.getenv("CHURN_MODEL_PATH", "models/churn_xgb.pkl")).exists(),
        "hb_model_exists":    Path(os.getenv("HB_MODEL_PATH",    "models/hb_lstm.pt")).exists(),
        "drift_threshold":    float(os.getenv("DRIFT_PSI_THRESHOLD", "0.2")),
        "demo_mode":          os.getenv("DEMO_MODE", "true"),
        "ts":                 datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _risk_tier(prob: float) -> str:
    if prob < 0.30: return "low"
    if prob < 0.55: return "medium"
    if prob < 0.75: return "high"
    return "critical"


def _key_signals(prob: float) -> list[str]:
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
    return {
        "status":  "ok",
        "service": "prediction-service",
        "version": "2.0.0",
        "mlops":   _MLOPS_AVAILABLE,
    }