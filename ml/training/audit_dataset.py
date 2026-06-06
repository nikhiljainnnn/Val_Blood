"""Quick dataset audit — Windows-safe (no emoji, explicit UTF-8)."""
import sys, io, pandas as pd, numpy as np

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

df = pd.read_csv("backend/Dataset.csv")
print(f"Shape: {df.shape[0]} rows x {df.shape[1]} columns\n")

print("=== ALL COLUMNS ===")
for col in df.columns:
    dtype    = str(df[col].dtype)
    null_pct = df[col].isnull().mean() * 100
    n_unique = df[col].nunique()
    notnull  = df[col].dropna()
    sample   = str(notnull.iloc[0])[:35] if len(notnull) > 0 else "N/A"
    print(f"  {col:<42} {dtype:<12} nulls={null_pct:5.1f}%  unique={n_unique:5}  sample={sample}")

print("\n=== ROLE DISTRIBUTION ===")
if "role" in df.columns:
    print(df["role"].value_counts().to_string())

print("\n=== TARGET / ACTIVE / STATUS COLUMNS ===")
for col in df.columns:
    if any(kw in col.lower() for kw in ["active", "churn", "status", "donate", "inactive"]):
        vc = dict(df[col].value_counts())
        print(f"  {col}: {vc}")

print("\n=== GPS / LOCATION COLUMNS ===")
for col in df.columns:
    if any(kw in col.lower() for kw in ["lat", "lon", "lng", "gps", "location"]):
        mn = df[col].min()
        mx = df[col].max()
        print(f"  {col}: min={mn}  max={mx}")

print("\n=== DATE / TRANSFUSION / NEXT COLUMNS ===")
for col in df.columns:
    if any(kw in col.lower() for kw in ["date", "transfusion", "next", "expected", "interval"]):
        notnull = df[col].dropna()
        sample  = str(notnull.iloc[0])[:35] if len(notnull) > 0 else "N/A"
        print(f"  {col}: dtype={df[col].dtype}  sample={sample}")

print("\n=== NUMERIC SUMMARY ===")
num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
print(df[num_cols].describe().round(2).to_string())

print("\n=== BRIDGE DONOR INACTIVE COUNT ===")
if "role" in df.columns and "user_donation_active_status" in df.columns:
    bridge = df[df["role"] == "Bridge Donor"]
    inactive_bridge = bridge[bridge["user_donation_active_status"] == 0]
    print(f"  Bridge Donors total:    {len(bridge)}")
    print(f"  Bridge Donors inactive: {len(inactive_bridge)}")
    pct = len(inactive_bridge) / max(len(bridge), 1) * 100
    print(f"  Inactive rate:          {pct:.1f}%")

print("\n=== URGENT PATIENTS (<=7 days) ===")
date_cols = [c for c in df.columns if "transfusion" in c.lower() and "date" in c.lower()]
if "role" in df.columns and date_cols:
    patients = df[df["role"] == "Patient"].copy()
    dcol = date_cols[0]
    print(f"  Using date column: {dcol}")
    patients[dcol] = pd.to_datetime(patients[dcol], errors="coerce")
    now = pd.Timestamp.now()
    patients["days_to_transfusion"] = (patients[dcol] - now).dt.days
    urgent = patients[patients["days_to_transfusion"] <= 7]
    print(f"  Total patients:  {len(patients)}")
    print(f"  Urgent (<= 7d):  {len(urgent)}")
