"""
RakSetu — Dataset Inspector
=============================
Run this THE MOMENT the dataset is handed to you.
Prints everything you need to fill in COLUMN_MAP in train_pipeline.py.

Usage:
    python inspect_dataset.py dataset.csv
    python inspect_dataset.py dataset.csv --suggest-mapping
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd


# Our canonical feature names — the inspector tries to auto-match these
OUR_FEATURES = {
    "days_since_last_donation": ["days_since_donation", "last_donation_days", "days_since_last", "donation_gap", "recency"],
    "msg_replies_90d":          ["reply_count", "replies", "message_replies", "wa_replies", "sms_replies"],
    "msg_opens_90d":            ["open_count", "opens", "message_opens", "msg_opens"],
    "lifetime_donations":       ["total_donations", "donation_count", "num_donations", "donations"],
    "account_age_days":         ["account_age", "days_active", "tenure_days", "member_since_days"],
    "karma_score":              ["karma", "points", "score", "reward_points"],
    "guardian_circle_count":    ["num_circles", "circles", "circle_count"],
    "call_answers_90d":         ["call_answered", "calls_answered", "call_count"],
}

TARGET_KEYWORDS = ["churn", "active", "label", "target", "lapse", "dropout", "inactive", "retained"]
HB_KEYWORDS     = ["hb", "hemoglobin", "haemoglobin", "hb_pre", "hb_post"]
SEQ_KEYWORDS    = ["interval", "days_to_next", "transfusion_days", "transfusion_interval"]


def auto_suggest_mapping(df_cols: list[str]) -> dict:
    """
    Fuzzy-match their column names to our feature names.
    Returns a suggested COLUMN_MAP dict — paste into train_pipeline.py.
    """
    suggested = {}
    df_cols_lower = {c.lower(): c for c in df_cols}

    for our_name, aliases in OUR_FEATURES.items():
        for alias in aliases:
            if alias in df_cols_lower:
                their_col = df_cols_lower[alias]
                suggested[their_col] = our_name
                break
        # Also try partial match
        if our_name not in suggested.values():
            for their_col_lower, their_col in df_cols_lower.items():
                for alias in aliases:
                    if alias in their_col_lower or their_col_lower in alias:
                        if their_col not in suggested:
                            suggested[their_col] = our_name
                        break

    return suggested


def main():
    parser = argparse.ArgumentParser(description="Dataset inspector for RakSetu")
    parser.add_argument("data", help="Path to dataset CSV")
    parser.add_argument("--suggest-mapping", action="store_true",
                        help="Auto-suggest COLUMN_MAP")
    parser.add_argument("--sample-rows", type=int, default=5,
                        help="Number of sample rows to show")
    args = parser.parse_args()

    path = Path(args.data)
    if not path.exists():
        print(f"❌ File not found: {path}")
        sys.exit(1)

    df = pd.read_csv(path)
    SEP = "─" * 70

    print(f"\n{'🩸 RAKSETU DATASET INSPECTOR':^70}")
    print(SEP)
    print(f"  File:   {path.name}")
    print(f"  Shape:  {df.shape[0]:,} rows × {df.shape[1]} columns")
    print(f"  Memory: {df.memory_usage(deep=True).sum() / 1024**2:.1f} MB")
    print(SEP)

    # ── Column overview ──────────────────────────────────────────────────────
    print("\n📋 COLUMNS")
    print(f"{'Column':<35} {'Type':<12} {'Nulls%':<10} {'Unique':<10} {'Sample'}")
    print("─" * 70)
    for col in df.columns:
        dtype    = str(df[col].dtype)
        null_pct = df[col].isnull().mean() * 100
        n_unique = df[col].nunique()
        sample   = df[col].dropna().iloc[0] if not df[col].dropna().empty else "—"
        if isinstance(sample, float):
            sample = f"{sample:.2f}"
        print(f"  {col:<33} {dtype:<12} {null_pct:>6.1f}%   {n_unique:>8}   {str(sample)[:20]}")

    # ── Numeric summary ──────────────────────────────────────────────────────
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if num_cols:
        print(f"\n📊 NUMERIC SUMMARY ({len(num_cols)} columns)")
        print(df[num_cols].describe().round(2).to_string())

    # ── Target detection ─────────────────────────────────────────────────────
    print(f"\n🎯 LIKELY TARGET COLUMNS")
    found_targets = [c for c in df.columns if any(kw in c.lower() for kw in TARGET_KEYWORDS)]
    if found_targets:
        for col in found_targets:
            vc = df[col].value_counts()
            print(f"  {col}: {dict(vc.to_dict())}")
            if vc.shape[0] == 2:
                pos_rate = vc.min() / len(df) * 100
                print(f"         → Binary. Minority class: {pos_rate:.1f}% — {'⚠ imbalanced' if pos_rate < 15 else '✓ balanced'}")
    else:
        print("  None detected. Use --target to specify manually.")

    # ── Hb / transfusion data ─────────────────────────────────────────────────
    print(f"\n🩸 HB / TRANSFUSION COLUMNS")
    hb_cols  = [c for c in df.columns if any(kw in c.lower() for kw in HB_KEYWORDS)]
    seq_cols = [c for c in df.columns if any(kw in c.lower() for kw in SEQ_KEYWORDS)]
    print(f"  Hb columns:       {hb_cols or 'None found'}")
    print(f"  Sequence/interval: {seq_cols or 'None found'}")
    if len(hb_cols) >= 4:
        print(f"  ✅ Enough Hb data for LSTM forecaster training ({len(hb_cols)} cols)")
    elif len(hb_cols) >= 2:
        print(f"  ℹ Some Hb data — will use linear regression fallback")
    else:
        print(f"  ⚠ No Hb data — Hb forecaster will use constant baseline")

    # ── Sample rows ──────────────────────────────────────────────────────────
    print(f"\n👀 FIRST {args.sample_rows} ROWS")
    print(df.head(args.sample_rows).to_string())

    # ── Auto-suggested mapping ────────────────────────────────────────────────
    if args.suggest_mapping:
        print(f"\n💡 SUGGESTED COLUMN_MAP FOR train_pipeline.py")
        print("   (Review carefully — auto-matching may be wrong)")
        print()
        suggested = auto_suggest_mapping(list(df.columns))
        if suggested:
            print("COLUMN_MAP = {")
            for their_col, our_feat in suggested.items():
                print(f'    "{their_col}": "{our_feat}",')
            print("}")
        else:
            print("  No automatic matches found.")
            print("  You'll need to fill COLUMN_MAP manually in train_pipeline.py")

        # Show unmapped features
        mapped_feats = set(suggested.values())
        unmapped = [f for f in OUR_FEATURES if f not in mapped_feats]
        if unmapped:
            print(f"\n  ⚠ Unmapped features (will fill with 0):")
            for f in unmapped:
                print(f"     {f}")

    print(f"\n{SEP}")
    print("  📌 Next steps:")
    print("  1. Fill in COLUMN_MAP in ml/training/train_pipeline.py")
    print("  2. Run: python ml/training/train_pipeline.py --data dataset.csv --target <target_col>")
    print(f"{SEP}\n")


if __name__ == "__main__":
    main()
