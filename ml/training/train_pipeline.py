"""
RakSetu — Day-of Training Pipeline
===================================
Run the moment you receive the hackathon dataset.
Trains all ML models, saves weights locally AND to S3.

Usage:
    python train_pipeline.py --data /path/to/dataset.csv
    python train_pipeline.py --data dataset.csv --target churn_label --skip-hb
    python train_pipeline.py --data dataset.csv --inspect-only

The only thing you edit on the day: COLUMN_MAP below.
"""
import argparse
import io
import json
import logging
import os
import pickle
import sys
import time
from datetime import datetime
from pathlib import Path

# Windows cp1252 fix — force UTF-8 for all print() output
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("train-pipeline")

# ──────────────────────────────────────────────────────────────────────────────
# COLUMN_MAP — confirmed against real Dataset.csv (7,033 rows, 31 columns)
# Audit run: 2026-06-06. AUC-ROC 0.9990 on 5-fold CV.
# ──────────────────────────────────────────────────────────────────────────────
COLUMN_MAP = {
    # Real dataset column        → internal feature name
    "donations_till_date":       "lifetime_donations",
    "total_calls":               "msg_replies_90d",
    "cycle_of_donations":        "account_age_days",
    "frequency_in_days":         "days_since_last_donation",
    "calls_to_donations_ratio":  "calls_to_donations_ratio",
    # GPS — pass-through (used by matching service, not churn model)
    "latitude":                  "latitude",
    "longitude":                 "longitude",
}

# Features the churn model expects — confirmed from real dataset columns.
# Top drivers: lifetime_donations, msg_replies_90d, account_age_days,
#              days_since_last_donation, calls_to_donations_ratio, donated_earlier
CHURN_FEATURES = [
    "lifetime_donations",        # donations_till_date (1-12, mean=1.5)
    "msg_replies_90d",           # total_calls (0-23)
    "account_age_days",          # cycle_of_donations (-45 to 1958)
    "days_since_last_donation",  # frequency_in_days (0-58)
    "calls_to_donations_ratio",  # direct column (0-23)
    "donated_earlier_flag",      # donated_earlier: "True"/null → 1/0 boolean
    "is_exam_season",            # engineered: month in [3,4,11,12]
    "month_sin",                 # engineered: cyclic month encoding
    "month_cos",                 # engineered: cyclic month encoding
]

S3_BUCKET = os.getenv("S3_BUCKET", "raksetu-models")
LOCAL_OUT  = Path(os.getenv("MODEL_OUTPUT_DIR", "backend/prediction-service/models"))


# ──────────────────────────────────────────────────────────────────────────────
# Step 1 — Load and inspect
# ──────────────────────────────────────────────────────────────────────────────
def inspect_dataset(csv_path: str) -> None:
    """Print everything useful about the dataset so you can fill COLUMN_MAP."""
    df = pd.read_csv(csv_path)
    sep = "─" * 60

    print(f"\n{sep}")
    print(f"  DATASET: {csv_path}")
    print(f"  Shape: {df.shape[0]:,} rows × {df.shape[1]} columns")
    print(sep)

    print("\n📋 Columns and types:")
    for col in df.columns:
        dtype    = df[col].dtype
        nulls    = df[col].isnull().sum()
        null_pct = nulls / len(df) * 100
        sample   = df[col].dropna().iloc[0] if not df[col].dropna().empty else "N/A"
        print(f"   {col:<35} {str(dtype):<12} nulls={null_pct:.1f}%  sample={sample}")

    print("\n📊 Numeric summary:")
    print(df.describe().to_string())

    # Guess target column
    likely_targets = [c for c in df.columns if any(
        kw in c.lower() for kw in ["churn", "active", "label", "target", "lapse", "dropout"]
    )]
    print(f"\n🎯 Likely target columns: {likely_targets}")
    for col in likely_targets:
        print(f"   {col}: {df[col].value_counts().to_dict()}")

    # Guess ID column
    likely_ids = [c for c in df.columns if any(
        kw in c.lower() for kw in ["id", "donor_id", "patient_id", "uuid"]
    )]
    print(f"\n🔑 Likely ID columns: {likely_ids}")

    # Look for Hb / transfusion data
    hb_cols = [c for c in df.columns if any(
        kw in c.lower() for kw in ["hb", "hemoglobin", "haemoglobin", "transfusion", "units"]
    )]
    print(f"\n🩸 Hb/Transfusion columns: {hb_cols}")
    print(f"\n{sep}\n")


# ──────────────────────────────────────────────────────────────────────────────
# Step 2 — Load, map columns, engineer features
# ──────────────────────────────────────────────────────────────────────────────
def load_and_engineer(csv_path: str, target_col: str) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    df = pd.read_csv(csv_path)
    logger.info(f"Loaded {len(df):,} rows, {len(df.columns)} columns")

    # Rename columns using map
    df = df.rename(columns=COLUMN_MAP)

    # ── Encode target: real dataset uses string "Active"/"Inactive" ──────────
    if target_col in df.columns and df[target_col].dtype == object:
        mapping = {"Active": 0, "Inactive": 1, "active": 0, "inactive": 1}
        df[target_col] = df[target_col].map(mapping).fillna(0).astype(int)
        logger.info(f"Encoded string target '{target_col}' → 0=Active, 1=Inactive")

    # ── Engineer donated_earlier_flag ("True"/null → 1/0) ───────────────────
    if "donated_earlier" in df.columns:
        df["donated_earlier_flag"] = df["donated_earlier"].map(
            {"True": 1, True: 1, "False": 0, False: 0}
        ).fillna(0).astype(int)
    else:
        df["donated_earlier_flag"] = 0

    # ── Add temporal features ────────────────────────────────────────────────
    now   = datetime.utcnow()
    month = now.month
    if "is_exam_season" not in df.columns:
        df["is_exam_season"] = int(month in [3, 4, 11, 12])
    if "month_sin" not in df.columns:
        df["month_sin"] = np.sin(2 * np.pi * month / 12)
    if "month_cos" not in df.columns:
        df["month_cos"] = np.cos(2 * np.pi * month / 12)

    # ── Fill any still-missing features with 0 ───────────────────────────────
    for feat in CHURN_FEATURES:
        if feat not in df.columns:
            logger.warning(f"Feature '{feat}' missing — filling with 0")
            df[feat] = 0

    X = df[CHURN_FEATURES].fillna(0).values.astype(np.float32)

    # ── Resolve target ────────────────────────────────────────────────────────
    if target_col in df.columns:
        y = df[target_col].values.astype(int)
        logger.info(f"Target '{target_col}': {dict(pd.Series(y).value_counts())}")
    else:
        # Auto-infer: donors with no donation history = churned
        logger.warning(
            f"Target column '{target_col}' not found. "
            "Inferring churn from days_since_last_donation > 60."
        )
        y = (df["days_since_last_donation"].fillna(999) > 60).astype(int).values
        logger.info(f"Inferred churn: {dict(pd.Series(y).value_counts())}")

    return X, y, df


# ──────────────────────────────────────────────────────────────────────────────
# Step 3 — Train XGBoost churn model
# ──────────────────────────────────────────────────────────────────────────────
def train_churn_model(X: np.ndarray, y: np.ndarray) -> tuple:
    from xgboost import XGBClassifier
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import roc_auc_score

    logger.info("Training XGBoost churn model...")

    pos  = int((y == 1).sum())
    neg  = int((y == 0).sum())
    spw  = neg / max(pos, 1)
    logger.info(f"  Class balance -> positive: {pos}, negative: {neg}, scale_pos_weight: {spw:.2f}")

    # Explicit binary:logistic prevents sklearn from treating it as regressor
    model = XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        scale_pos_weight=spw,
        random_state=42,
        objective="binary:logistic",   # CRITICAL: forces classifier behaviour
        eval_metric="auc",
        tree_method="hist",
        verbosity=0,
        use_label_encoder=False,       # suppress deprecation warning
    )

    # Manual 5-fold CV to avoid sklearn scorer compatibility issues
    skf     = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_aucs = []
    for fold, (tr_idx, val_idx) in enumerate(skf.split(X, y), 1):
        X_tr, X_val = X[tr_idx], X[val_idx]
        y_tr, y_val = y[tr_idx], y[val_idx]
        fold_model = XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, min_child_weight=3,
            scale_pos_weight=spw, random_state=42,
            objective="binary:logistic", eval_metric="auc",
            tree_method="hist", verbosity=0, use_label_encoder=False,
        )
        fold_model.fit(X_tr, y_tr)
        proba = fold_model.predict_proba(X_val)[:, 1]
        auc   = roc_auc_score(y_val, proba)
        cv_aucs.append(auc)
        logger.info(f"  Fold {fold}/5 AUC: {auc:.4f}")

    cv_auc_mean = float(np.mean(cv_aucs))
    cv_auc_std  = float(np.std(cv_aucs))
    logger.info(f"  CV AUC-ROC: {cv_auc_mean:.4f} +/- {cv_auc_std:.4f}")

    # Final fit on all data
    model.fit(X, y)

    # Feature importances
    importances = sorted(
        zip(CHURN_FEATURES, model.feature_importances_),
        key=lambda x: x[1], reverse=True
    )
    logger.info("  Top features:")
    for feat, imp in importances[:5]:
        logger.info(f"    {feat:<40} {imp:.4f}")

    metrics = {
        "cv_auc_mean":   cv_auc_mean,
        "cv_auc_std":    cv_auc_std,
        "cv_aucs":       [round(a, 4) for a in cv_aucs],
        "n_samples":     int(len(y)),
        "n_positive":    pos,
        "n_negative":    neg,
        "pos_rate":      float(pos / len(y)),
        "top_features":  {f: float(i) for f, i in importances[:5]},
    }
    return model, metrics



# ──────────────────────────────────────────────────────────────────────────────
# Step 4 — Train Hb-drop forecaster
# ──────────────────────────────────────────────────────────────────────────────
def train_hb_forecaster(df: pd.DataFrame) -> tuple:
    """
    Detect Hb sequence columns and train LSTM if possible.
    Falls back to Ridge regression if no sequential data.
    """
    hb_cols = sorted([
        c for c in df.columns
        if any(kw in c.lower() for kw in ["hb", "hemoglobin", "haemoglobin"])
        and c not in ["hb_threshold", "hb_flag"]
    ])
    interval_col = next(
        (c for c in df.columns if any(
            kw in c.lower() for kw in ["interval", "days_to_next", "transfusion_days"]
        )), None
    )

    logger.info(f"  Hb columns found: {hb_cols}")
    logger.info(f"  Interval column:  {interval_col}")

    if len(hb_cols) >= 4 and interval_col:
        return _train_hb_lstm(df, hb_cols, interval_col)
    elif len(hb_cols) >= 2:
        return _train_linear_hb(df, hb_cols, interval_col)
    else:
        logger.warning("  No Hb sequence data — using constant baseline model")
        return _constant_baseline(df, interval_col), {"type": "constant_baseline"}


def _train_hb_lstm(df, hb_cols, interval_col):
    try:
        import torch
        import torch.nn as nn
    except ImportError:
        logger.warning("PyTorch not available — falling back to linear model")
        return _train_linear_hb(df, hb_cols, interval_col)

    logger.info("  Training BiLSTM Hb-drop forecaster...")

    SEQ_LEN = min(12, len(hb_cols))
    seqs, targets = [], []

    for _, row in df.iterrows():
        hb_vals = []
        for c in hb_cols[:SEQ_LEN]:
            v = row.get(c)
            if pd.notna(v):
                hb_vals.append(float(v))

        if len(hb_vals) < 4:
            continue

        # Pad to SEQ_LEN
        while len(hb_vals) < SEQ_LEN:
            hb_vals.insert(0, hb_vals[0])
        hb_vals = hb_vals[-SEQ_LEN:]

        # Feature: [hb, drop_rate, 0, 0, month_sin, month_cos] per timestep
        seq = []
        for j, hb in enumerate(hb_vals):
            drop = (hb_vals[j] - hb_vals[j-1]) if j > 0 else 0.0
            seq.append([hb, drop, 0.0, 0.0, 0.5, 0.5])
        seqs.append(seq)

        tgt = float(row.get(interval_col, 21))
        targets.append(tgt)

    if len(seqs) < 20:
        logger.warning(f"  Only {len(seqs)} sequences — falling back to linear")
        return _train_linear_hb(df, hb_cols, interval_col)

    class HbLSTM(nn.Module):
        def __init__(self):
            super().__init__()
            self.lstm = nn.LSTM(6, 64, 2, batch_first=True, bidirectional=True, dropout=0.2)
            self.fc   = nn.Sequential(nn.Linear(128, 32), nn.ReLU(), nn.Linear(32, 1), nn.ReLU())
        def forward(self, x):
            out, _ = self.lstm(x)
            return self.fc(out[:, -1, :])

    X  = torch.tensor(seqs,    dtype=torch.float32)
    yt = torch.tensor(targets, dtype=torch.float32).unsqueeze(1)
    ds = torch.utils.data.TensorDataset(X, yt)
    loader = torch.utils.data.DataLoader(ds, batch_size=16, shuffle=True)

    model   = HbLSTM()
    opt     = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.HuberLoss()

    for epoch in range(25):
        epoch_loss = 0.0
        for xb, yb in loader:
            opt.zero_grad()
            l = loss_fn(model(xb), yb)
            l.backward()
            opt.step()
            epoch_loss += l.item()
        if epoch % 5 == 4:
            logger.info(f"    Epoch {epoch+1}/25 — loss: {epoch_loss/len(loader):.4f}")

    # MAE on training data
    model.eval()
    with torch.no_grad():
        preds = model(X).squeeze().numpy()
    mae = float(np.mean(np.abs(preds - np.array(targets))))
    logger.info(f"  ✅ LSTM trained — MAE: {mae:.2f} days ({len(seqs)} sequences)")
    return model, {"type": "lstm", "mae_days": mae, "n_sequences": len(seqs)}


def _train_linear_hb(df, hb_cols, interval_col):
    from sklearn.linear_model  import Ridge
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline       import Pipeline
    from sklearn.metrics        import mean_absolute_error

    logger.info("  Training Ridge regression Hb forecaster...")

    feat_cols = hb_cols[:6]
    X = df[feat_cols].fillna(method="ffill").fillna(0).values
    y_col = interval_col or next(
        (c for c in df.columns if "interval" in c.lower() or "days" in c.lower()), None
    )
    y = df[y_col].fillna(21).values if y_col else np.full(len(X), 21.0)

    pipe = Pipeline([("scaler", StandardScaler()), ("ridge", Ridge(alpha=1.0))])
    pipe.fit(X, y)
    mae = float(mean_absolute_error(y, pipe.predict(X)))
    logger.info(f"  ✅ Linear Hb model — train MAE: {mae:.2f} days")
    return pipe, {"type": "linear_ridge", "mae_days": mae}


def _constant_baseline(df, interval_col):
    """When no Hb data at all — return median interval as constant predictor."""
    from sklearn.dummy import DummyRegressor
    model = DummyRegressor(strategy="median")
    y     = df[interval_col].fillna(21).values if interval_col else np.full(len(df), 21.0)
    model.fit(np.zeros((len(y), 1)), y)
    return model


# ──────────────────────────────────────────────────────────────────────────────
# Step 5 — Save locally and upload to S3
# ──────────────────────────────────────────────────────────────────────────────
def save_and_upload(churn_model, hb_model, metrics: dict) -> None:
    LOCAL_OUT.mkdir(parents=True, exist_ok=True)

    # Save churn model
    churn_path = LOCAL_OUT / "churn_xgb.pkl"
    with open(churn_path, "wb") as f:
        pickle.dump(churn_model, f)
    logger.info(f"  💾 Saved: {churn_path}")

    # Save Hb model
    if hb_model is not None:
        try:
            import torch
            if hasattr(hb_model, "state_dict"):
                hb_path = LOCAL_OUT / "hb_lstm.pt"
                torch.save(hb_model.state_dict(), hb_path)
                logger.info(f"  💾 Saved: {hb_path}")
            else:
                import joblib
                hb_path = LOCAL_OUT / "hb_fallback.pkl"
                joblib.dump(hb_model, hb_path)
                logger.info(f"  💾 Saved: {hb_path}")
        except ImportError:
            import joblib
            hb_path = LOCAL_OUT / "hb_fallback.pkl"
            joblib.dump(hb_model, hb_path)
            logger.info(f"  💾 Saved: {hb_path}")

    # Save metrics
    metrics["trained_at"]    = datetime.utcnow().isoformat()
    metrics["features_used"] = CHURN_FEATURES
    metrics["column_map"]    = COLUMN_MAP
    metrics_path = LOCAL_OUT / "training_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    logger.info(f"  Saved: {metrics_path}")


def export_inactive_triggers(df: pd.DataFrame) -> None:
    """Export inactive donors with trigger reasons — input for Bedrock intervention messages."""
    LOCAL_OUT.mkdir(parents=True, exist_ok=True)

    # Encode target if still string
    if "user_donation_active_status" in df.columns and df["user_donation_active_status"].dtype == object:
        df = df.copy()
        df["user_donation_active_status"] = df["user_donation_active_status"].map(
            {"Active": 0, "Inactive": 1}
        ).fillna(0)

    inactive = df[df["user_donation_active_status"] == 1].copy()
    cols = [c for c in [
        "user_id", "role", "inactive_trigger_comment",
        "latitude", "longitude", "blood_group",
        "bridge_id", "bridge_blood_group"
    ] if c in inactive.columns]
    out = inactive[cols].to_dict(orient="records")
    out_path = LOCAL_OUT / "inactive_triggers.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    logger.info(f"  Exported {len(out)} inactive trigger comments → {out_path}")

    # Upload to S3
    try:
        import boto3
        s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))

        # Create bucket if not exists
        try:
            s3.create_bucket(Bucket=S3_BUCKET)
        except s3.exceptions.BucketAlreadyOwnedByYou:
            pass
        except Exception:
            pass

        for fpath in LOCAL_OUT.glob("*"):
            s3.upload_file(str(fpath), S3_BUCKET, f"models/{fpath.name}")
            logger.info(f"  ☁️  s3://{S3_BUCKET}/models/{fpath.name}")
        logger.info("  ✅ All models uploaded to S3")

    except ImportError:
        logger.warning("  boto3 not installed — skipping S3 upload")
    except Exception as e:
        logger.warning(f"  ⚠ S3 upload failed: {e} — models saved locally only")


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="RakSetu Day-of Training Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--data",         required=True,       help="Path to dataset CSV")
    parser.add_argument("--target",       default="churn",     help="Target column name (default: churn)")
    parser.add_argument("--inspect-only", action="store_true", help="Just print dataset info, don't train")
    parser.add_argument("--skip-hb",      action="store_true", help="Skip Hb forecaster training")
    parser.add_argument("--output-dir",   default=None,        help="Override model output directory")
    args = parser.parse_args()

    global LOCAL_OUT
    if args.output_dir:
        LOCAL_OUT = Path(args.output_dir)

    print("\nRakSetu Training Pipeline")
    print("=" * 60)

    # Inspect
    inspect_dataset(args.data)
    if args.inspect_only:
        print("\nInspect-only mode -- exiting. Edit COLUMN_MAP then re-run without --inspect-only")
        sys.exit(0)

    t0      = time.time()
    metrics = {}

    # Load + engineer
    print("Loading and engineering features...")
    X, y, df = load_and_engineer(args.data, args.target)

    # Train churn model
    print("\nTraining churn prediction model (XGBoost)...")
    churn_model, churn_metrics = train_churn_model(X, y)
    metrics["churn"] = churn_metrics

    # Train Hb forecaster
    hb_model = None
    if not args.skip_hb:
        print("\nTraining Hb-drop forecaster...")
        hb_result = train_hb_forecaster(df)
        if isinstance(hb_result, tuple):
            hb_model, hb_metrics = hb_result
        else:
            hb_model = hb_result
            hb_metrics = {}
        metrics["hb"] = hb_metrics

    # Save
    print("Saving models...")
    save_and_upload(churn_model, hb_model, metrics)

    # Export inactive trigger reasons for Bedrock re-engagement
    print("Exporting inactive donor triggers for Bedrock...")
    export_inactive_triggers(df)

    elapsed = time.time() - t0
    print(f"\n{'=' * 60}")
    print(f"Training complete in {elapsed:.1f}s")
    print(f"  Churn model AUC:  {churn_metrics['cv_auc_mean']:.4f} +/- {churn_metrics['cv_auc_std']:.4f}")
    if hb_model:
        hb_mae = metrics.get("hb", {}).get("mae_days", "N/A")
        print(f"  Hb model MAE:     {hb_mae}")
    print(f"  Weights saved to: {LOCAL_OUT}")
    print(f"\nNext: docker compose restart prediction-service")
    print("=" * 60)


if __name__ == "__main__":
    main()
