"""
RakSetu -- Export Guardian Circle + Urgent Patients from Real Dataset
=====================================================================
Run after train_pipeline.py completes.

Outputs (to backend/prediction-service/models/):
  - guardian_circle_seed.json   : all 2061 bridge donors, status=active/at_risk
  - urgent_patients.json        : 67 patients needing transfusion in <=7 days
  - at_risk_bridge_summary.json : top-line demo numbers

Usage:
    python ml/training/export_guardian_circle.py --data backend/Dataset.csv
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

OUT_DIR = Path("backend/prediction-service/models")


def export_guardian_circle(df: pd.DataFrame) -> dict:
    """Extract bridge donors with active/at_risk status."""
    bridge = df[df["role"] == "Bridge Donor"].copy()

    # Determine status from user_donation_active_status
    def gc_status(row):
        status = str(row.get("user_donation_active_status", "Active"))
        if status in ("Inactive", "inactive"):
            return "at_risk"
        return "active"

    bridge["gc_status"] = bridge.apply(gc_status, axis=1)

    # Select export columns
    keep = [c for c in [
        "user_id", "bridge_id", "gc_status",
        "blood_group", "bridge_blood_group",
        "latitude", "longitude",
        "donations_till_date", "total_calls", "cycle_of_donations",
        "frequency_in_days", "calls_to_donations_ratio",
        "donated_earlier", "inactive_trigger_comment",
        "last_donation_date", "next_eligible_date",
        "registration_date",
    ] if c in bridge.columns]

    records = bridge[keep].to_dict(orient="records")

    # Sanitize NaN for JSON
    clean = []
    for r in records:
        clean.append({k: (None if (isinstance(v, float) and v != v) else v)
                      for k, v in r.items()})

    out_path = OUT_DIR / "guardian_circle_seed.json"
    with open(out_path, "w") as f:
        json.dump(clean, f, indent=2, default=str)

    at_risk_count  = sum(1 for r in clean if r.get("gc_status") == "at_risk")
    active_count   = sum(1 for r in clean if r.get("gc_status") == "active")

    print(f"Bridge Donors total    : {len(clean)}")
    print(f"  Active               : {active_count}")
    print(f"  At-risk (inactive)   : {at_risk_count}  ({at_risk_count/max(len(clean),1)*100:.1f}%)")
    print(f"Saved -> {out_path}")

    return {"total": len(clean), "active": active_count, "at_risk": at_risk_count}


def export_urgent_patients(df: pd.DataFrame) -> dict:
    """Extract patients needing transfusion in <=7 days."""
    patients = df[df["role"] == "Patient"].copy()

    # Parse expected_next_transfusion_date
    dcol = "expected_next_transfusion_date"
    if dcol not in patients.columns:
        # Fall back to last_transfusion_date + 21 days
        dcol = "last_transfusion_date"
        patients[dcol] = pd.to_datetime(patients[dcol], errors="coerce")
        patients["_next_date"] = patients[dcol] + pd.Timedelta(days=21)
    else:
        patients["_next_date"] = pd.to_datetime(patients[dcol], errors="coerce")

    now = pd.Timestamp.now(tz=None)
    patients["days_to_transfusion"] = (patients["_next_date"] - now).dt.days
    urgent = patients[patients["days_to_transfusion"] <= 7].copy()

    keep = [c for c in [
        "user_id", "blood_group", "latitude", "longitude",
        "last_transfusion_date", "expected_next_transfusion_date",
        "days_to_transfusion", "bridge_id", "bridge_blood_group",
    ] if c in urgent.columns]

    records = urgent[keep].to_dict(orient="records")
    # Sort by urgency (most urgent first)
    records.sort(key=lambda r: r.get("days_to_transfusion", 999))

    clean = []
    for r in records:
        clean.append({k: (None if (isinstance(v, float) and v != v) else v)
                      for k, v in r.items()})

    out_path = OUT_DIR / "urgent_patients.json"
    with open(out_path, "w") as f:
        json.dump(clean, f, indent=2, default=str)

    print(f"\nPatients total         : {len(patients)}")
    print(f"  Urgent (<=7 days)    : {len(clean)}")
    print(f"Saved -> {out_path}")

    return {"total_patients": len(patients), "urgent": len(clean)}


def export_summary(gc_stats: dict, patient_stats: dict) -> None:
    """Export top-line demo numbers as a single JSON for the dashboard."""
    summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "headline_numbers": {
            "total_bridge_donors":       gc_stats["total"],
            "active_bridge_donors":      gc_stats["active"],
            "at_risk_bridge_donors":     gc_stats["at_risk"],
            "at_risk_pct":               round(gc_stats["at_risk"] / max(gc_stats["total"], 1) * 100, 1),
            "urgent_patients_7d":        patient_stats["urgent"],
            "total_patients":            patient_stats["total_patients"],
        },
        "demo_lines": {
            "line_1": f"{gc_stats['at_risk']} matched donors are at risk of dropping out.",
            "line_2": f"{patient_stats['urgent']} urgent cases identified automatically.",
            "line_3": "Here are the 3 we are activating right now.",
        }
    }
    out_path = OUT_DIR / "demo_summary.json"
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2)

    print("\n=== DEMO NUMBERS ===")
    for k, v in summary["headline_numbers"].items():
        print(f"  {k:<35}: {v}")
    print("\n=== DEMO SCRIPT LINES ===")
    for line in summary["demo_lines"].values():
        print(f"  \"{line}\"")
    print(f"\nSaved -> {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Export Guardian Circle + Urgent Patients")
    parser.add_argument("--data", default="backend/Dataset.csv", help="Path to dataset CSV")
    args = parser.parse_args()

    path = Path(args.data)
    if not path.exists():
        print(f"ERROR: File not found: {path}")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nRakSetu -- Guardian Circle + Urgent Patient Export")
    print("=" * 55)
    print(f"Dataset: {path}")

    df = pd.read_csv(path)
    print(f"Loaded : {len(df):,} rows x {len(df.columns)} columns\n")

    gc_stats      = export_guardian_circle(df)
    patient_stats = export_urgent_patients(df)
    export_summary(gc_stats, patient_stats)

    print("\nDone. Run next: python backend/prediction-service/seed_from_exports.py")


if __name__ == "__main__":
    main()
