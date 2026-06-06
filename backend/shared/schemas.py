"""
Pydantic v2 schemas for all inter-service API contracts.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class Urgency(str, Enum):
    NORMAL   = "normal"
    URGENT   = "urgent"
    CRITICAL = "critical"

class RequestStatus(str, Enum):
    OPEN      = "open"
    MATCHED   = "matched"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    FAILED    = "failed"

class DonorStatus(str, Enum):
    ACTIVE   = "active"
    AT_RISK  = "at_risk"
    CHURNED  = "churned"
    DONATED  = "donated"

class Language(str, Enum):
    HI = "hi"
    TA = "ta"
    TE = "te"
    BN = "bn"
    EN = "en"
    MR = "mr"


# ─── Antigen Profile ──────────────────────────────────────────────────────────

class AntigenProfileIn(BaseModel):
    abo:        str  = Field(..., pattern="^(A|B|AB|O)$")
    rh_d:       bool
    rh_c:       bool = False
    rh_C:       bool = False
    rh_e:       bool = True
    rh_E:       bool = False
    kell_k:     bool = True
    kell_K:     bool = False
    duffy_fya:  bool = False
    duffy_fyb:  bool = False
    kidd_jka:   bool = False
    kidd_jkb:   bool = False
    mns_M:      bool = False
    mns_N:      bool = False
    mns_S:      bool = False
    mns_s:      bool = True
    source:     str  = "serological"

    @field_validator("abo")
    @classmethod
    def abo_upper(cls, v: str) -> str:
        return v.upper()


class AntigenProfileOut(AntigenProfileIn):
    id:          str
    person_id:   str
    genotyped_at: Optional[datetime] = None
    created_at:  datetime

    model_config = {"from_attributes": True}


# ─── Compatibility ────────────────────────────────────────────────────────────

class CompatibilityResult(BaseModel):
    score:           float = Field(..., ge=0.0, le=1.0)
    mismatches:      List[str]
    mismatch_count:  int
    compatible:      bool
    risk_level:      str    # "safe"|"caution"|"incompatible"


class DonorMatchResult(BaseModel):
    donor_id:           str
    donor_name:         str
    phone:              str
    language:           Language
    compatibility:      CompatibilityResult
    churn_probability:  float
    availability_prob:  float
    days_to_eligible:   int
    distance_km:        Optional[float] = None
    rank:               int
    status:             DonorStatus


class GuardianCircleOut(BaseModel):
    patient_id:         str
    patient_name:       str
    circle_size:        int
    avg_compatibility:  float
    at_risk_count:      int
    donors:             List[DonorMatchResult]


# ─── Transfusion Request ──────────────────────────────────────────────────────

class TransfusionRequestIn(BaseModel):
    patient_id:   str
    hospital_id:  str
    urgency:      Urgency = Urgency.NORMAL
    units_needed: int     = Field(1, ge=1, le=10)
    hb_at_request: Optional[float] = None
    notes:        Optional[str] = None


class TransfusionRequestOut(BaseModel):
    id:          str
    patient_id:  str
    status:      RequestStatus
    urgency:     Urgency
    matched_donors: List[DonorMatchResult] = []
    created_at:  datetime
    updated_at:  datetime

    model_config = {"from_attributes": True}


# ─── Churn Prediction ─────────────────────────────────────────────────────────

class ChurnPredictionOut(BaseModel):
    donor_id:          str
    churn_probability: float = Field(..., ge=0.0, le=1.0)
    risk_tier:         str   # "low"|"medium"|"high"|"critical"
    key_signals:       List[str]
    recommended_action: str
    predicted_at:      datetime


class BatchChurnOut(BaseModel):
    predictions:    List[ChurnPredictionOut]
    total_at_risk:  int
    computed_at:    datetime


# ─── Hb Forecast ──────────────────────────────────────────────────────────────

class HbForecastOut(BaseModel):
    patient_id:            str
    predicted_days_to_threshold: float   # days until Hb < 8 g/dL
    confidence_interval:   tuple[float, float]  # (lower, upper) 90% CI
    recommended_transfusion_date: datetime
    urgency_flag:          bool
    forecasted_at:         datetime


# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationIn(BaseModel):
    donor_id:      str
    patient_id:    str
    request_id:    str
    urgency:       Urgency = Urgency.NORMAL
    slot_time:     Optional[str] = None
    language:      Language = Language.HI


class NotificationOut(BaseModel):
    notification_id: str
    donor_id:        str
    channels_fired:  List[str]
    status:          str
    created_at:      datetime


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    phone:    str
    password: str

class TokenOut(BaseModel):
    access_token:  str
    token_type:    str = "bearer"
    role:          str
    user_id:       str
    expires_in:    int

class UserOut(BaseModel):
    id:        str
    name:      str
    phone:     str
    role:      str
    language:  str
    city:      Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Donor Registration ───────────────────────────────────────────────────────

class DonorRegisterIn(BaseModel):
    name:     str = Field(..., min_length=2)
    phone:    str = Field(..., pattern=r"^\+91[6-9]\d{9}$")
    language: Language = Language.HI
    city:     str
    password: str = Field(..., min_length=8)
    antigen_profile: AntigenProfileIn


class PatientRegisterIn(BaseModel):
    name:       str
    phone:      str = Field(..., pattern=r"^\+91[6-9]\d{9}$")
    language:   Language = Language.HI
    city:       str
    password:   str
    age:        int
    weight_kg:  float
    hospital_id: str
    thalassemia_type: str = "major"
    antigen_profile: AntigenProfileIn


# ─── Story Engine ─────────────────────────────────────────────────────────────

class StoryOut(BaseModel):
    donor_id:          str
    patient_id:        str
    story_text:        str
    language:          Language
    donation_number:   int
    generated_at:      datetime


# ─── Inventory ────────────────────────────────────────────────────────────────

class InventoryOut(BaseModel):
    hospital_id:   str
    hospital_name: str
    city:          str
    units_by_type: dict   # {"A+": 12, "O-": 3, ...}
    total_units:   int
    updated_at:    datetime


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    active_patients:       int
    active_donors:         int
    guardian_circles:      int
    at_risk_donors:        int
    open_requests:         int
    units_available:       int
    transfusions_this_month: int
    avg_circle_health:     float   # 0-1
