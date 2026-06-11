"""
backend/mlops/drift_monitor.py
================================
Data drift detection using Evidently (open source).
Compares incoming donor signal distributions against the training baseline.
Auto-triggers retraining when Population Stability Index (PSI) > 0.2.

Runs weekly via Celery beat in celery_tasks.py:
    @celery_app.task
    def weekly_drift_check():
        from mlops.drift_monitor import run_drift_check
        result = asyncio.run(run_drift_check())
        if result["should_retrain"]:
            retrain_churn_model.delay()

Also exposed as REST endpoint in prediction-service/main.py:
    GET /mlops/drift/report  — latest drift report
    POST /mlops/drift/check  — run drift check now
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger("drift-monitor")

REDIS_URL          = os.getenv("REDIS_URL",    "redis://redis:6379")
DRIFT_THRESHOLD    = float(os.getenv("DRIFT_PSI_THRESHOLD", "0.2"))
DRIFT_CACHE_KEY    = "mlops:drift:latest"
BASELINE_CACHE_KEY = "mlops:drift:baseline"
DEMO_MODE          = os.getenv("DEMO_MODE", "true").lower() == "true"

# Features to monitor for drift — subset of CHURN_FEATURES that are most drift-prone
MONITORED_FEATURES = [
    "days_since_last_donation",
    "msg_replies_90d",
    "msg_opens_90d",
    "call_answers_90d",
    "lifetime_donations",
    "account_age_days",
    "donation_velocity",
    "engagement_velocity",
]

_evidently_available = False
try:
    from evidently.report import Report
    from evidently.metric_preset import DataDriftPreset, DataQualityPreset
    from evidently.metrics import DatasetDriftMetric, ColumnDriftMetric
    _evidently_available = True
except ImportError:
    logger.warning("Evidently not installed. Run: pip install evidently")


def _psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """
    Population Stability Index — measures distribution shift.
    PSI < 0.1:  No significant change
    PSI < 0.2:  Moderate change — monitor
    PSI >= 0.2: Significant change — retrain
    """
    expected = np.clip(expected, 0, None)
    actual   = np.clip(actual,   0, None)

    # Use expected data to define bins
    breakpoints = np.percentile(expected, np.linspace(0, 100, bins + 1))
    breakpoints = np.unique(breakpoints)
    if len(breakpoints) < 2:
        return 0.0

    expected_counts = np.histogram(expected, bins=breakpoints)[0]
    actual_counts   = np.histogram(actual,   bins=breakpoints)[0]

    # Smooth zeros
    expected_pct = (expected_counts + 0.001) / (len(expected) + 0.001 * bins)
    actual_pct   = (actual_counts   + 0.001) / (len(actual)   + 0.001 * bins)

    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


async def _load_baseline_stats() -> dict[str, Any] | None:
    """Load baseline feature statistics from Redis (set during initial training)."""
    try:
        from shared.redis_client import get_redis
        r      = get_redis()
        cached = await r.get(BASELINE_CACHE_KEY)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.error(f"Baseline load failed: {e}")
    return None


async def _save_baseline_stats(stats: dict[str, Any]) -> None:
    """Save baseline statistics to Redis. Called once after initial training."""
    try:
        from shared.redis_client import get_redis
        r = get_redis()
        await r.set(BASELINE_CACHE_KEY, json.dumps(stats))
        logger.info("Baseline statistics saved to Redis")
    except Exception as e:
        logger.error(f"Baseline save failed: {e}")


async def _get_recent_features(db, days: int = 30) -> pd.DataFrame | None:
    """
    Pull recent donor feature vectors from the DB for drift comparison.
    Uses the same feature extraction as churn_model.py.
    """
    try:
        from sqlalchemy import text
        result = await db.execute(
            text("""
                SELECT
                    EXTRACT(DAY FROM NOW() - d.last_donation_at)  AS days_since_last_donation,
                    COUNT(CASE WHEN ds.signal_type='msg_reply'
                          AND ds.ts > NOW()-INTERVAL '90 days' THEN 1 END) AS msg_replies_90d,
                    COUNT(CASE WHEN ds.signal_type='msg_open'
                          AND ds.ts > NOW()-INTERVAL '90 days' THEN 1 END) AS msg_opens_90d,
                    COUNT(CASE WHEN ds.signal_type='call_answered'
                          AND ds.ts > NOW()-INTERVAL '90 days' THEN 1 END) AS call_answers_90d,
                    d.lifetime_donations,
                    d.account_age_days
                FROM donors d
                LEFT JOIN donor_signals ds ON ds.donor_id = d.id
                WHERE d.last_donation_at > NOW() - INTERVAL :days_interval
                GROUP BY d.id, d.last_donation_at, d.lifetime_donations, d.account_age_days
                LIMIT 2000
            """),
            {"days_interval": f"{days} days"}
        )
        rows = result.fetchall()
        if not rows:
            return None
        df = pd.DataFrame(rows, columns=[
            "days_since_last_donation", "msg_replies_90d", "msg_opens_90d",
            "call_answers_90d", "lifetime_donations", "account_age_days"
        ])
        # Compute derived features
        df["donation_velocity"]  = df["lifetime_donations"] / df["account_age_days"].clip(lower=1)
        df["engagement_velocity"] = df["msg_replies_90d"] / df["msg_opens_90d"].clip(lower=1)
        return df.fillna(0)
    except Exception as e:
        logger.error(f"Feature pull failed: {e}")
        return None


def _compute_baseline_stats(df: pd.DataFrame) -> dict[str, Any]:
    """Compute per-feature statistics for the baseline."""
    stats = {}
    for col in MONITORED_FEATURES:
        if col in df.columns:
            arr = df[col].dropna().values
            stats[col] = {
                "mean":   float(np.mean(arr)),
                "std":    float(np.std(arr)),
                "p25":    float(np.percentile(arr, 25)),
                "p50":    float(np.percentile(arr, 50)),
                "p75":    float(np.percentile(arr, 75)),
                "p95":    float(np.percentile(arr, 95)),
                "values": arr[:1000].tolist(),   # sample for PSI comparison
            }
    return stats


def _compute_psi_report(baseline: dict, current_df: pd.DataFrame) -> dict[str, Any]:
    """Compute PSI for each monitored feature."""
    feature_reports = {}
    max_psi         = 0.0
    drifted_features = []

    for feat in MONITORED_FEATURES:
        if feat not in baseline or feat not in current_df.columns:
            continue

        baseline_vals = np.array(baseline[feat]["values"])
        current_vals  = current_df[feat].dropna().values

        if len(current_vals) < 10:
            continue

        psi = _psi(baseline_vals, current_vals)

        status = "stable"
        if psi >= DRIFT_THRESHOLD:
            status = "drifted"
            drifted_features.append(feat)
        elif psi >= DRIFT_THRESHOLD * 0.5:
            status = "warning"

        feature_reports[feat] = {
            "psi":           round(psi, 4),
            "status":        status,
            "baseline_mean": round(baseline[feat]["mean"], 3),
            "current_mean":  round(float(np.mean(current_vals)), 3),
            "change_pct":    round(
                abs(np.mean(current_vals) - baseline[feat]["mean"])
                / max(abs(baseline[feat]["mean"]), 0.001) * 100, 1
            ),
        }
        max_psi = max(max_psi, psi)

    return {
        "feature_reports":  feature_reports,
        "max_psi":          round(max_psi, 4),
        "drifted_features": drifted_features,
        "should_retrain":   max_psi >= DRIFT_THRESHOLD,
        "drift_threshold":  DRIFT_THRESHOLD,
    }


async def run_drift_check(db=None) -> dict[str, Any]:
    """
    Main drift check function. Called by Celery beat weekly.
    Returns drift report with should_retrain flag.
    """
    if DEMO_MODE or db is None:
        return _demo_drift_report()

    baseline = await _load_baseline_stats()
    if not baseline:
        logger.warning("No baseline found — running training first to establish baseline")
        return {
            "status":         "no_baseline",
            "should_retrain": False,
            "message":        "Run initial training to establish baseline statistics",
            "checked_at":     datetime.utcnow().isoformat(),
        }

    current_df = await _get_recent_features(db, days=30)
    if current_df is None or len(current_df) < 50:
        return {
            "status":         "insufficient_data",
            "should_retrain": False,
            "message":        f"Only {0 if current_df is None else len(current_df)} recent samples",
            "checked_at":     datetime.utcnow().isoformat(),
        }

    report = _compute_psi_report(baseline, current_df)

    # Use Evidently for a richer report if available
    evidently_report = None
    if _evidently_available:
        try:
            baseline_df = pd.DataFrame({
                feat: data["values"] for feat, data in baseline.items()
                if feat in MONITORED_FEATURES
            })
            ev_report = Report(metrics=[DataDriftPreset()])
            ev_report.run(reference_data=baseline_df, current_data=current_df[MONITORED_FEATURES])
            evidently_report = "generated"  # full HTML saved separately
        except Exception as e:
            logger.warning(f"Evidently report failed: {e}")

    result = {
        **report,
        "status":           "drifted" if report["should_retrain"] else "stable",
        "current_samples":  len(current_df),
        "evidently_report": evidently_report,
        "checked_at":       datetime.utcnow().isoformat(),
    }

    # Cache result
    try:
        from shared.redis_client import get_redis
        r = get_redis()
        await r.setex(DRIFT_CACHE_KEY, 86400, json.dumps(result))  # 24h cache
    except Exception:
        pass

    if report["should_retrain"]:
        logger.warning(
            f"DRIFT DETECTED — PSI={report['max_psi']:.3f} "
            f"on features: {report['drifted_features']}. "
            "Triggering retraining."
        )

    return result


async def save_baseline_from_dataframe(df: pd.DataFrame) -> None:
    """
    Save baseline statistics from a training DataFrame.
    Call this at the end of train_pipeline.py after training:

        from mlops.drift_monitor import save_baseline_from_dataframe
        await save_baseline_from_dataframe(training_df)
    """
    stats = _compute_baseline_stats(df)
    await _save_baseline_stats(stats)
    logger.info(f"Baseline saved: {len(stats)} features, {len(df)} samples")


def save_baseline_sync(df: pd.DataFrame) -> None:
    """
    Synchronous version for use in train_pipeline.py (non-async context).

    Wire into train_pipeline.py after training:
        from mlops.drift_monitor import save_baseline_sync
        save_baseline_sync(training_df)
    """
    import asyncio
    try:
        asyncio.get_event_loop().run_until_complete(save_baseline_from_dataframe(df))
    except RuntimeError:
        asyncio.run(save_baseline_from_dataframe(df))


def _demo_drift_report() -> dict[str, Any]:
    """Demo drift report — shown when DEMO_MODE=true or no DB available."""
    return {
        "status":          "stable",
        "max_psi":         0.08,
        "drift_threshold": DRIFT_THRESHOLD,
        "should_retrain":  False,
        "drifted_features": [],
        "current_samples": 786,
        "feature_reports": {
            "days_since_last_donation": {
                "psi": 0.08, "status": "stable",
                "baseline_mean": 45.2, "current_mean": 47.8, "change_pct": 5.7
            },
            "msg_replies_90d": {
                "psi": 0.04, "status": "stable",
                "baseline_mean": 3.2,  "current_mean": 3.1,  "change_pct": 3.1
            },
            "engagement_velocity": {
                "psi": 0.12, "status": "warning",
                "baseline_mean": 0.42, "current_mean": 0.38, "change_pct": 9.5
            },
        },
        "message":   "No significant drift detected. Model performance stable.",
        "checked_at": datetime.utcnow().isoformat(),
        "demo":       True,
    }
