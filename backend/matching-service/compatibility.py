"""
12-antigen molecular compatibility scoring engine.
Implements ISBT-guideline alloimmunization prevention scoring.
"""
from dataclasses import dataclass
from typing import Optional
from shared.models import AntigenProfile as AntigenProfileORM


# ─── Antigen significance weights (clinically validated) ──────────────────────
# Source: ISBT Red Cell Immunogenetics, ASH Education Book 2019
ANTIGEN_WEIGHTS: dict[str, float] = {
    "rh_d":       0.95,   # Most common clinically significant alloantibody
    "kell_K":     0.85,   # Highly immunogenic, second most common
    "rh_C":       0.75,
    "rh_c":       0.75,   # Anti-c causes severe HDN
    "rh_E":       0.70,
    "rh_e":       0.65,
    "duffy_fya":  0.60,   # Plasmodium vivax receptor
    "duffy_fyb":  0.55,
    "kidd_jka":   0.55,   # Delayed haemolytic transfusion reactions
    "kidd_jkb":   0.50,
    "mns_S":      0.45,
    "mns_s":      0.40,
    "kell_k":     0.30,   # k (cellano) — less immunogenic
    "mns_M":      0.25,
    "mns_N":      0.20,
}

TOTAL_WEIGHT = sum(ANTIGEN_WEIGHTS.values())


@dataclass
class AntigenDataclass:
    abo:       str
    rh_d:      bool
    rh_c:      bool
    rh_C:      bool
    rh_e:      bool
    rh_E:      bool
    kell_k:    bool
    kell_K:    bool
    duffy_fya: bool
    duffy_fyb: bool
    kidd_jka:  bool
    kidd_jkb:  bool
    mns_M:     bool
    mns_N:     bool
    mns_S:     bool
    mns_s:     bool


def to_antigen_dataclass(orm: AntigenProfileORM) -> AntigenDataclass:
    """Convert ORM model to pure dataclass for scoring."""
    return AntigenDataclass(
        abo=orm.abo,
        rh_d=bool(orm.rh_d),
        rh_c=bool(orm.rh_c),
        rh_C=bool(orm.rh_C),
        rh_e=bool(orm.rh_e),
        rh_E=bool(orm.rh_E),
        kell_k=bool(orm.kell_k),
        kell_K=bool(orm.kell_K),
        duffy_fya=bool(orm.duffy_fya),
        duffy_fyb=bool(orm.duffy_fyb),
        kidd_jka=bool(orm.kidd_jka),
        kidd_jkb=bool(orm.kidd_jkb),
        mns_M=bool(orm.mns_M),
        mns_N=bool(orm.mns_N),
        mns_S=bool(orm.mns_S),
        mns_s=bool(orm.mns_s),
    )


# ABO compatibility table (patient ABO -> acceptable donor ABOs)
ABO_COMPATIBLE: dict[str, list[str]] = {
    "O":  ["O"],
    "A":  ["O", "A"],
    "B":  ["O", "B"],
    "AB": ["O", "A", "B", "AB"],
}


def compute_compatibility(
    patient: AntigenDataclass,
    donor: AntigenDataclass,
) -> dict:
    """
    Compute 12-antigen compatibility score.

    A mismatch = donor carries antigen that patient lacks.
    This triggers alloimmunization in multi-transfused patients.

    Returns:
        score:          float 0-1 (1 = perfectly matched)
        mismatches:     list of antigen names that mismatch
        mismatch_count: int
        compatible:     bool (True = no mismatches)
        risk_level:     "safe" | "caution" | "incompatible"
        abo_compatible: bool
    """
    # ABO HARD CHECK — non-negotiable
    if donor.abo not in ABO_COMPATIBLE.get(patient.abo, []):
        return {
            "score":          0.0,
            "mismatches":     ["abo"],
            "mismatch_count": 1,
            "compatible":     False,
            "risk_level":     "incompatible",
            "abo_compatible": False,
        }

    mismatches: list[str] = []
    penalty: float = 0.0

    # Check each minor antigen system
    # Rule: if donor has antigen (+) and patient does not (-) → mismatch
    checks = [
        ("rh_d",      patient.rh_d,      donor.rh_d),
        ("rh_C",      patient.rh_C,      donor.rh_C),
        ("rh_c",      patient.rh_c,      donor.rh_c),
        ("rh_E",      patient.rh_E,      donor.rh_E),
        ("rh_e",      patient.rh_e,      donor.rh_e),
        ("kell_K",    patient.kell_K,    donor.kell_K),
        ("kell_k",    patient.kell_k,    donor.kell_k),
        ("duffy_fya", patient.duffy_fya, donor.duffy_fya),
        ("duffy_fyb", patient.duffy_fyb, donor.duffy_fyb),
        ("kidd_jka",  patient.kidd_jka,  donor.kidd_jka),
        ("kidd_jkb",  patient.kidd_jkb,  donor.kidd_jkb),
        ("mns_M",     patient.mns_M,     donor.mns_M),
        ("mns_N",     patient.mns_N,     donor.mns_N),
        ("mns_S",     patient.mns_S,     donor.mns_S),
        ("mns_s",     patient.mns_s,     donor.mns_s),
    ]

    for name, patient_has, donor_has in checks:
        # Donor+ when patient- → alloimmunization risk
        if donor_has and not patient_has:
            mismatches.append(name)
            penalty += ANTIGEN_WEIGHTS.get(name, 0.3)

    score = max(0.0, round(1.0 - (penalty / TOTAL_WEIGHT), 4))

    if len(mismatches) == 0:
        risk_level = "safe"
    elif score >= 0.7:
        risk_level = "caution"
    else:
        risk_level = "incompatible"

    return {
        "score":          score,
        "mismatches":     mismatches,
        "mismatch_count": len(mismatches),
        "compatible":     len(mismatches) == 0,
        "risk_level":     risk_level,
        "abo_compatible": True,
    }


def rank_donors(
    patient_profile: AntigenDataclass,
    donor_profiles: list[tuple[str, AntigenDataclass]],
    min_score: float = 0.0,
) -> list[dict]:
    """
    Rank a list of donors by compatibility score.

    Args:
        patient_profile: patient's antigen profile
        donor_profiles: list of (donor_id, AntigenDataclass)
        min_score: filter out donors below this score

    Returns sorted list of {donor_id, ...compatibility_result}
    """
    results = []
    for donor_id, donor_profile in donor_profiles:
        result = compute_compatibility(patient_profile, donor_profile)
        if result["score"] >= min_score:
            results.append({"donor_id": donor_id, **result})

    return sorted(results, key=lambda x: x["score"], reverse=True)


# ─── GPS Distance + Composite Ranking ─────────────────────────────────────────
# Upgrade over existing 91.7% blood group match rate.
# Real Dataset.csv has latitude/longitude for all 786 bridge donors.
# ──────────────────────────────────────────────────────────────────────────────

from math import radians, sin, cos, sqrt, atan2


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Haversine formula for great-circle distance between two GPS coordinates.
    Returns distance in kilometres.

    Used to rank donors by proximity to the patient's hospital.
    All 786 bridge donors in Dataset.csv have lat/lon coverage.
    """
    R = 6371.0  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def distance_weight(distance_km: float) -> float:
    """
    Convert distance to a 0-1 weight.
    Tiers calibrated for Indian urban geography (hospitals within city boundaries).
    """
    if distance_km <= 5:    return 1.00   # Same neighbourhood
    if distance_km <= 15:   return 0.90   # Same zone of city
    if distance_km <= 30:   return 0.75   # Across city
    if distance_km <= 50:   return 0.55   # Nearby district
    if distance_km <= 100:  return 0.35   # Different district
    return 0.15                           # Long-distance (last resort)


def composite_rank_score(
    compatibility_score: float,
    distance_km: float,
    churn_probability: float,
) -> float:
    """
    Combined ranking score merging three signals:
      - Antigen compatibility (50%) — clinical safety, non-negotiable primary signal
      - GPS proximity     (30%) — reduces no-show risk, faster response
      - Churn availability (20%) — predicted from XGBoost model (AUC 0.9990)

    Score range: 0.0 - 1.0 (higher = better match)

    This is the core improvement over the existing 91.7% blood group match:
    we now factor in WHO will actually show up and HOW CLOSE they are.
    """
    dist_w       = distance_weight(distance_km)
    availability = 1.0 - churn_probability   # churn_probability from prediction-service

    return (
        compatibility_score * 0.50 +
        dist_w              * 0.30 +
        availability        * 0.20
    )


def rank_donors_composite(
    patient_profile: AntigenDataclass,
    donor_profiles: list[tuple[str, AntigenDataclass]],
    patient_lat: float,
    patient_lon: float,
    donor_locations: dict[str, tuple[float, float]],   # donor_id -> (lat, lon)
    churn_scores: dict[str, float],                     # donor_id -> churn_probability
    min_compat: float = 0.0,
) -> list[dict]:
    """
    Full composite ranking: compatibility + GPS distance + churn risk.

    Args:
        patient_profile:  patient antigen profile
        donor_profiles:   list of (donor_id, AntigenDataclass)
        patient_lat/lon:  patient hospital GPS coordinates
        donor_locations:  {donor_id: (lat, lon)} from Dataset.csv
        churn_scores:     {donor_id: float} from prediction-service
        min_compat:       minimum antigen compatibility score to include

    Returns:
        List of dicts sorted by composite_score descending.
        Includes: donor_id, compatibility, distance_km, churn_probability,
                  dist_weight, composite_score
    """
    results = []
    for donor_id, donor_profile in donor_profiles:
        compat = compute_compatibility(patient_profile, donor_profile)
        if compat["score"] < min_compat:
            continue

        # GPS distance
        if donor_id in donor_locations:
            d_lat, d_lon = donor_locations[donor_id]
            dist_km = haversine_km(patient_lat, patient_lon, d_lat, d_lon)
        else:
            dist_km = 999.0  # Unknown location — penalised

        churn_prob    = churn_scores.get(donor_id, 0.5)
        dist_w        = distance_weight(dist_km)
        comp_score    = composite_rank_score(compat["score"], dist_km, churn_prob)

        results.append({
            "donor_id":           donor_id,
            "compatibility_score": compat["score"],
            "antigen_mismatches": compat["mismatch_count"],
            "risk_level":         compat["risk_level"],
            "distance_km":        round(dist_km, 2),
            "dist_weight":        round(dist_w, 3),
            "churn_probability":  round(churn_prob, 4),
            "availability":       round(1.0 - churn_prob, 4),
            "composite_score":    round(comp_score, 4),
        })

    return sorted(results, key=lambda x: x["composite_score"], reverse=True)

