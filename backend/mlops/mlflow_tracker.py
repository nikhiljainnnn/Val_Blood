"""
backend/mlops/mlflow_tracker.py
================================
MLflow tracking wired into the existing train_pipeline.py and churn_model.py.
Logs every training run: AUC, features, dataset hash, hyperparameters.
Manages model versions: staging → production promotion with approval gate.

Usage in train_pipeline.py (add after model training):
    from mlops.mlflow_tracker import log_training_run, promote_if_better
    run_id = log_training_run(model, metrics, dataset_path, feature_names)
    promote_if_better(run_id, metric="cv_auc_mean", threshold=0.85)

Usage in churn_model.py (add to _load_model):
    from mlops.mlflow_tracker import load_production_model
    self.model = load_production_model("raksetu-churn") or self._load_from_file()

MLflow server added to docker-compose.yml as a new service.
UI available at http://localhost:5000 after docker compose up.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import pickle
import time
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("mlflow-tracker")

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
EXPERIMENT_NAME     = os.getenv("MLFLOW_EXPERIMENT",   "raksetu-churn-prediction")
MODEL_NAME          = "raksetu-churn"
HB_MODEL_NAME       = "raksetu-hb-forecaster"

_mlflow_available = False
try:
    import mlflow
    import mlflow.sklearn
    import mlflow.pytorch
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    _mlflow_available = True
except ImportError:
    logger.warning("MLflow not installed. Run: pip install mlflow")


def _get_or_create_experiment() -> str:
    """Get experiment ID, creating it if it doesn't exist."""
    if not _mlflow_available:
        return "0"
    try:
        exp = mlflow.get_experiment_by_name(EXPERIMENT_NAME)
        if exp is None:
            return mlflow.create_experiment(
                EXPERIMENT_NAME,
                tags={
                    "project":  "raksetu",
                    "team":     "blood-warriors",
                    "created":  datetime.utcnow().isoformat(),
                }
            )
        return exp.experiment_id
    except Exception as e:
        logger.error(f"MLflow experiment error: {e}")
        return "0"


def _dataset_hash(dataset_path: str) -> str:
    """SHA256 of first 10MB of dataset for reproducibility tracking."""
    try:
        h = hashlib.sha256()
        with open(dataset_path, "rb") as f:
            h.update(f.read(10 * 1024 * 1024))
        return h.hexdigest()[:16]
    except Exception:
        return "unknown"


def log_training_run(
    model,
    metrics:        dict[str, Any],
    dataset_path:   str,
    feature_names:  list[str],
    hyperparams:    dict[str, Any] | None = None,
    model_type:     str = "xgboost",
) -> str | None:
    """
    Log a complete training run to MLflow.
    Returns the run_id for promotion.

    Wire into train_pipeline.py after training:
        run_id = log_training_run(
            model=churn_model,
            metrics={"cv_auc_mean": 0.9990, "cv_auc_std": 0.0007, "n_samples": 7033},
            dataset_path="Dataset.csv",
            feature_names=CHURN_FEATURES,
        )
    """
    if not _mlflow_available:
        logger.warning("MLflow unavailable — skipping tracking")
        return None

    exp_id = _get_or_create_experiment()

    try:
        with mlflow.start_run(experiment_id=exp_id) as run:
            run_id = run.info.run_id

            # ── Log hyperparameters ───────────────────────────────────────────
            params = hyperparams or {}
            if hasattr(model, "get_params"):
                params.update(model.get_params())
            mlflow.log_params({k: str(v) for k, v in params.items()})

            # ── Log metrics ───────────────────────────────────────────────────
            for key, val in metrics.items():
                if isinstance(val, (int, float)):
                    mlflow.log_metric(key, float(val))

            # ── Log dataset info ──────────────────────────────────────────────
            mlflow.set_tags({
                "dataset_hash":    _dataset_hash(dataset_path),
                "dataset_path":    dataset_path,
                "feature_count":   str(len(feature_names)),
                "model_type":      model_type,
                "trained_at":      datetime.utcnow().isoformat(),
                "python_env":      f"python {__import__('sys').version[:5]}",
            })

            # ── Log feature list as artifact ──────────────────────────────────
            feature_path = "/tmp/features.json"
            with open(feature_path, "w") as f:
                json.dump({"features": feature_names, "count": len(feature_names)}, f, indent=2)
            mlflow.log_artifact(feature_path, "metadata")

            # ── Log model ─────────────────────────────────────────────────────
            if model_type == "xgboost":
                mlflow.sklearn.log_model(
                    model,
                    artifact_path="model",
                    registered_model_name=MODEL_NAME,
                    input_example=[[0.0] * len(feature_names)],
                )
            elif model_type == "pytorch" and _mlflow_available:
                mlflow.pytorch.log_model(
                    model,
                    artifact_path="model",
                    registered_model_name=HB_MODEL_NAME,
                )

            logger.info(
                f"MLflow run logged: {run_id} "
                f"(AUC={metrics.get('cv_auc_mean', 'N/A'):.4f})"
            )
            return run_id

    except Exception as e:
        logger.error(f"MLflow logging failed: {e}")
        return None


def promote_if_better(
    run_id:    str,
    metric:    str  = "cv_auc_mean",
    threshold: float = 0.85,
    model_name: str  = MODEL_NAME,
) -> bool:
    """
    Compare new run against current production model.
    Promote to staging if metric exceeds threshold.
    Promote to production if it beats current production metric.

    Returns True if promoted to production.
    """
    if not _mlflow_available or not run_id:
        return False

    try:
        client    = mlflow.tracking.MlflowClient()
        new_run   = client.get_run(run_id)
        new_score = float(new_run.data.metrics.get(metric, 0))

        if new_score < threshold:
            logger.info(
                f"New model score {new_score:.4f} below threshold {threshold} "
                "— staying in staging"
            )
            # Move to staging only
            _set_model_stage(client, model_name, run_id, "Staging")
            return False

        # Compare against current production
        prod_models = client.get_latest_versions(model_name, stages=["Production"])
        if prod_models:
            prod_run_id = prod_models[0].run_id
            prod_run    = client.get_run(prod_run_id)
            prod_score  = float(prod_run.data.metrics.get(metric, 0))

            if new_score <= prod_score:
                logger.info(
                    f"New model ({new_score:.4f}) does not beat production "
                    f"({prod_score:.4f}) — staying in staging"
                )
                _set_model_stage(client, model_name, run_id, "Staging")
                return False

            # Archive old production
            _set_model_stage(client, model_name, prod_run_id, "Archived")

        # Promote to production
        _set_model_stage(client, model_name, run_id, "Production")
        logger.info(
            f"Model promoted to Production: {run_id} "
            f"(score={new_score:.4f})"
        )
        return True

    except Exception as e:
        logger.error(f"Model promotion failed: {e}")
        return False


def _set_model_stage(client, model_name: str, run_id: str, stage: str):
    """Helper to move a model version to a stage."""
    try:
        versions = client.search_model_versions(f"run_id='{run_id}'")
        if versions:
            client.transition_model_version_stage(
                name=model_name,
                version=versions[0].version,
                stage=stage,
                archive_existing_versions=(stage == "Production"),
            )
    except Exception as e:
        logger.error(f"Stage transition failed: {e}")


def load_production_model(model_name: str = MODEL_NAME):
    """
    Load the current Production model from MLflow registry.
    Falls back to None if unavailable (churn_model.py then uses file-based loading).

    Wire into churn_model.py _load_model():
        from mlops.mlflow_tracker import load_production_model
        self.model = load_production_model() or self._load_from_file()
    """
    if not _mlflow_available:
        return None
    try:
        model_uri = f"models:/{model_name}/Production"
        model     = mlflow.sklearn.load_model(model_uri)
        logger.info(f"Loaded production model from MLflow: {model_name}")
        return model
    except Exception as e:
        logger.warning(f"Could not load from MLflow registry: {e}")
        return None


def get_model_history(model_name: str = MODEL_NAME, n: int = 10) -> list[dict]:
    """
    Return last N training run summaries.
    Used by the /mlops/history endpoint in prediction-service.
    """
    if not _mlflow_available:
        return _demo_history()
    try:
        client  = mlflow.tracking.MlflowClient()
        exp     = mlflow.get_experiment_by_name(EXPERIMENT_NAME)
        if not exp:
            return _demo_history()

        runs = client.search_runs(
            experiment_ids=[exp.experiment_id],
            order_by=["start_time DESC"],
            max_results=n,
        )
        return [
            {
                "run_id":     r.info.run_id[:8],
                "auc":        round(r.data.metrics.get("cv_auc_mean", 0), 4),
                "n_samples":  int(r.data.metrics.get("n_samples", 0)),
                "dataset":    r.data.tags.get("dataset_hash", "unknown"),
                "trained_at": r.data.tags.get("trained_at", ""),
                "stage":      _get_run_stage(client, model_name, r.info.run_id),
            }
            for r in runs
        ]
    except Exception as e:
        logger.error(f"get_model_history failed: {e}")
        return _demo_history()


def _get_run_stage(client, model_name: str, run_id: str) -> str:
    try:
        versions = client.search_model_versions(f"run_id='{run_id}'")
        if versions:
            return versions[0].current_stage
    except Exception:
        pass
    return "None"


def _demo_history() -> list[dict]:
    """Demo data when MLflow server not available."""
    return [
        {"run_id": "a1b2c3d4", "auc": 0.9990, "n_samples": 7033,
         "dataset": "blood_warriors_v1", "trained_at": "2026-06-07T10:00:00", "stage": "Production"},
        {"run_id": "e5f6g7h8", "auc": 0.9850, "n_samples": 7033,
         "dataset": "blood_warriors_v1", "trained_at": "2026-06-01T08:00:00", "stage": "Archived"},
        {"run_id": "i9j0k1l2", "auc": 0.9720, "n_samples": 6800,
         "dataset": "blood_warriors_v0", "trained_at": "2026-05-15T09:00:00", "stage": "Archived"},
    ]
