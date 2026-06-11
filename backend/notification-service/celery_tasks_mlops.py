"""
backend/notification-service/celery_tasks_mlops.py
====================================================
MLOps Celery tasks for Phase 2.
Add these to your existing celery_tasks.py by appending:

    from celery_tasks_mlops import (
        retrain_churn_model_task,
        weekly_drift_check_task,
        monthly_awareness_task,
    )

Or import this file at the bottom of celery_tasks.py:
    exec(open('celery_tasks_mlops.py').read())

Schedule (add to celery beat_schedule in celery_tasks.py):
    "weekly-drift-check": {
        "task": "celery_tasks.weekly_drift_check_task",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),  # Sunday 2AM
    },
    "weekly-retrain": {
        "task": "celery_tasks.retrain_churn_model_task",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Sunday 3AM
    },
"""
import asyncio
import logging
import os

logger = logging.getLogger("celery-mlops")

# Import the existing Celery app from main.py
# This file is meant to be appended/imported into main.py
try:
    from main import celery_app
except ImportError:
    # Standalone import — create minimal app for testing
    from celery import Celery
    celery_app = Celery(
        "raksetu",
        broker=os.getenv("CELERY_BROKER", "redis://redis:6379/1"),
    )


@celery_app.task(
    name="celery_tasks.retrain_churn_model_task",
    bind=True,
    max_retries=2,
    default_retry_delay=300,   # retry after 5 minutes
)
def retrain_churn_model_task(self, trigger: str = "scheduled"):
    """
    Retrain the XGBoost churn model on latest data.
    Triggered by: weekly beat, drift detection, or manual API call.
    """
    logger.info(f"Retraining churn model (trigger={trigger})")
    try:
        from mlops.retrain_pipeline import run_retrain_pipeline
        result = asyncio.run(run_retrain_pipeline(db=None, trigger=trigger))
        logger.info(f"Retrain complete: AUC={result.get('auc', 'N/A')}, promoted={result.get('promoted')}")
        return result
    except Exception as e:
        logger.error(f"Retrain failed: {e}")
        self.retry(exc=e)


@celery_app.task(
    name="celery_tasks.weekly_drift_check_task",
    bind=True,
    max_retries=1,
)
def weekly_drift_check_task(self):
    """
    Weekly drift check. If PSI > 0.2 on any feature, auto-triggers retraining.
    """
    logger.info("Running weekly drift check")
    try:
        from mlops.drift_monitor import run_drift_check
        result = asyncio.run(run_drift_check(db=None))

        logger.info(
            f"Drift check: status={result.get('status')}, "
            f"max_psi={result.get('max_psi')}, "
            f"should_retrain={result.get('should_retrain')}"
        )

        if result.get("should_retrain"):
            logger.warning("Drift detected — queuing retraining")
            retrain_churn_model_task.delay(trigger="drift")

        return result
    except Exception as e:
        logger.error(f"Drift check failed: {e}")
        self.retry(exc=e)


@celery_app.task(
    name="celery_tasks.monthly_awareness_task",
)
def monthly_awareness_task():
    """Monthly blood group awareness campaign for unknown-BG users."""
    logger.info("Running monthly awareness campaign")
    try:
        from upgrade5_awareness_campaign import run_awareness_campaign
        result = asyncio.run(run_awareness_campaign())
        return result
    except Exception as e:
        logger.error(f"Awareness campaign failed: {e}")
        return {"error": str(e)}


# ── Beat schedule additions ────────────────────────────────────────────────────
# Paste this into your existing celery_tasks.py beat_schedule dict:
MLOPS_BEAT_SCHEDULE = {
    "weekly-drift-check": {
        "task":     "celery_tasks.weekly_drift_check_task",
        "schedule": {"hour": 2, "minute": 0, "day_of_week": 0},  # Sunday 2AM
    },
    "weekly-retrain": {
        "task":     "celery_tasks.retrain_churn_model_task",
        "schedule": {"hour": 3, "minute": 0, "day_of_week": 0},  # Sunday 3AM
    },
    "monthly-awareness": {
        "task":     "celery_tasks.monthly_awareness_task",
        "schedule": {"hour": 10, "minute": 0, "day_of_month": 1},  # 1st of month
    },
}
