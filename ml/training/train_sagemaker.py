"""
RakSetu — SageMaker Training Entry Point
=========================================
This script runs INSIDE the SageMaker training container.
Do not run directly — invoked by sagemaker_launcher.py via the SDK.

SageMaker provides:
  /opt/ml/input/data/train/   ← CSV dataset lands here
  /opt/ml/model/              ← save model files here (gets tar.gz'd and uploaded to S3)
  /opt/ml/output/             ← training metrics/logs
"""
import argparse
import json
import os
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import roc_auc_score

# SageMaker standard paths
INPUT_DIR  = Path(os.getenv("SM_CHANNEL_TRAIN",  "/opt/ml/input/data/train"))
MODEL_DIR  = Path(os.getenv("SM_MODEL_DIR",       "/opt/ml/model"))
OUTPUT_DIR = Path(os.getenv("SM_OUTPUT_DATA_DIR", "/opt/ml/output"))

# Must match train_pipeline.py
CHURN_FEATURES = [
    "days_since_last_donation",
    "msg_replies_90d",
    "msg_opens_90d",
    "lifetime_donations",
    "account_age_days",
    "karma_score",
    "guardian_circle_count",
    "call_answers_90d",
    "is_exam_season",
    "month_sin",
    "month_cos",
]

COLUMN_MAP = {
    "days_since_donation": "days_since_last_donation",
    "last_donation_days":  "days_since_last_donation",
    "reply_count":         "msg_replies_90d",
    "open_count":          "msg_opens_90d",
    "total_donations":     "lifetime_donations",
    "account_age":         "account_age_days",
    "karma":               "karma_score",
}


def find_csv() -> Path:
    """Find the dataset CSV in the SageMaker input directory."""
    csvs = list(INPUT_DIR.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(f"No CSV files found in {INPUT_DIR}")
    if len(csvs) > 1:
        print(f"  Multiple CSVs found: {csvs} — using first: {csvs[0]}")
    return csvs[0]


def load_data(target_col: str):
    csv_path = find_csv()
    print(f"  Loading: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"  Shape: {df.shape}")

    df = df.rename(columns=COLUMN_MAP)

    import datetime
    month = datetime.datetime.utcnow().month
    df["is_exam_season"] = int(month in [3, 4, 11, 12])
    df["month_sin"]      = float(np.sin(2 * np.pi * month / 12))
    df["month_cos"]      = float(np.cos(2 * np.pi * month / 12))

    for feat in CHURN_FEATURES:
        if feat not in df.columns:
            print(f"  ⚠ Feature '{feat}' missing — filling with 0")
            df[feat] = 0

    X = df[CHURN_FEATURES].fillna(0).values.astype(np.float32)

    if target_col in df.columns:
        y = df[target_col].values.astype(int)
    else:
        print(f"  ⚠ Target '{target_col}' not found — inferring from donation recency")
        y = (df["days_since_last_donation"].fillna(999) > 60).astype(int).values

    print(f"  Target distribution: {dict(pd.Series(y).value_counts())}")
    return X, y


def train(X, y, hyperparams: dict):
    pos = (y == 1).sum()
    neg = (y == 0).sum()
    spw = neg / max(pos, 1)

    model = XGBClassifier(
        n_estimators=int(hyperparams.get("n-estimators", 200)),
        max_depth=int(hyperparams.get("max-depth", 4)),
        learning_rate=float(hyperparams.get("learning-rate", 0.05)),
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=spw,
        random_state=42,
        eval_metric="auc",
        tree_method="hist",
        verbosity=1,
    )

    skf    = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_auc = cross_val_score(model, X, y, cv=skf, scoring="roc_auc", n_jobs=-1)
    print(f"  CV AUC-ROC: {cv_auc.mean():.4f} ± {cv_auc.std():.4f}")

    model.fit(X, y)
    return model, float(cv_auc.mean())


def save_model(model, auc: float):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Save model weights
    model_path = MODEL_DIR / "churn_xgb.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"  Saved model: {model_path}")

    # Save metrics (SageMaker picks these up for experiment tracking)
    metrics = {
        "cv_auc": auc,
        "features": CHURN_FEATURES,
    }
    metrics_path = OUTPUT_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Saved metrics: {metrics_path}")

    # SageMaker metric format for CloudWatch
    print(f"auc: {auc:.4f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-column",  default="churn")
    parser.add_argument("--n-estimators",   type=int,   default=200)
    parser.add_argument("--max-depth",      type=int,   default=4)
    parser.add_argument("--learning-rate",  type=float, default=0.05)
    parser.add_argument("--output-dir",     default=str(MODEL_DIR))
    args = parser.parse_args()

    print("\n🩸 RakSetu SageMaker Training")
    print("=" * 50)

    X, y = load_data(args.target_column)
    print("\n🧠 Training XGBoost...")

    model, auc = train(X, y, {
        "n-estimators":  args.n_estimators,
        "max-depth":     args.max_depth,
        "learning-rate": args.learning_rate,
    })

    print("\n💾 Saving model...")
    save_model(model, auc)

    print(f"\n✅ Done — AUC: {auc:.4f}")


if __name__ == "__main__":
    main()
