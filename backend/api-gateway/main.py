"""
RakSetu API Gateway
- JWT auth middleware
- Rate limiting (Redis sliding window)
- Reverse proxy to microservices
- WebSocket hub for real-time dashboard
- UPGRADE 2: Guest activation engine  (POST /admin/activate-guests)
- UPGRADE 6: Past-due transfusion alerts (POST /admin/alerts/scan)
- AGENT:    Bedrock Supervisor orchestrator (POST /agent/run)
"""
import os
import sys
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated

# Load secrets from SSM Parameter Store before initializing anything else
from shared.ssm_loader import load_ssm_parameters
load_ssm_parameters()

import httpx
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from auth import (
    create_access_token,
    verify_token,
    TokenData,
)
from rate_limit import RateLimiter
from shared.db import get_db, init_db
from shared.redis_client import get_redis
from shared.schemas import LoginIn, TokenOut, DonorRegisterIn, PatientRegisterIn
from shared.models import Person, Donor, Patient, AntigenProfile

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime

# ── Upgrade + Agent wiring ────────────────────────────────────────────────────
_LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), '..', 'lambdas')
_BACKEND_DIR = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, _LAMBDAS_DIR)
sys.path.insert(0, _BACKEND_DIR)

from upgrade2_guest_activator import router as guest_router      # noqa: E402
from upgrade6_past_due_alerts  import router as alerts_router    # noqa: E402
from agent.orchestrator        import router as agent_router     # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api-gateway")

# ─── Service URLs ─────────────────────────────────────────────────────────────
SERVICES = {
    "matching":      os.getenv("MATCHING_URL",      "http://matching-service:8001"),
    "prediction":    os.getenv("PREDICTION_URL",    "http://prediction-service:8002"),
    "notification":  os.getenv("NOTIFICATION_URL",  "http://notification-service:8003"),
    "voice":         os.getenv("VOICE_URL",         "http://voice-service:8004"),
    "federated":     os.getenv("FEDERATED_URL",     "http://federated-aggregator:8005"),
    "story":         os.getenv("STORY_URL",         "http://story-engine:8007"),
    "analytics":     os.getenv("ANALYTICS_URL",     "http://analytics-service:8008"),
}

# ─── WebSocket Connection Manager ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # room -> [ws]

    async def connect(self, ws: WebSocket, room: str):
        await ws.accept()
        self.active.setdefault(room, []).append(ws)
        logger.info(f"WS connected to room '{room}' — total: {len(self.active[room])}")

    def disconnect(self, ws: WebSocket, room: str):
        if room in self.active:
            self.active[room] = [w for w in self.active[room] if w != ws]

    async def broadcast(self, room: str, data: dict):
        msg = json.dumps(data)
        dead = []
        for ws in self.active.get(room, []):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, room)

    async def broadcast_all(self, data: dict):
        for room in list(self.active.keys()):
            await self.broadcast(room, data)


manager = ConnectionManager()

# ─── App lifecycle ────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("API Gateway started")
    yield
    logger.info("API Gateway shutting down")


app = FastAPI(
    title="RakSetu API Gateway",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security    = HTTPBearer()
limiter     = RateLimiter()
http_client = httpx.AsyncClient(timeout=30.0)

# ── Mount upgrade + agent routers ─────────────────────────────────────────────
# These are mounted directly on the gateway (no prefix clash with /api/v1).
# guest_router  → /admin/activate-guests, /admin/guest-pool/stats
# alerts_router → /admin/alerts/scan, /admin/alerts/summary, /admin/alerts/cascade/{id}
# agent_router  → /agent/run, /agent/scheduled, /agent/status
app.include_router(guest_router)
app.include_router(alerts_router)
app.include_router(agent_router)


# ─── Auth helpers ─────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> TokenData:
    token = credentials.credentials
    data  = verify_token(token)
    if not data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return data


async def require_role(*roles: str):
    async def inner(user: TokenData = Depends(get_current_user)) -> TokenData:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user
    return inner


# ─── Auth routes ─────────────────────────────────────────────────────────────
@app.post("/api/v1/auth/login", response_model=TokenOut)
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Person).where(Person.phone == body.phone)
    )
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # In production: check hashed password stored in a credentials table
    # For demo: simplified check
    token = create_access_token({"sub": person.id, "role": person.role, "name": person.name})
    return TokenOut(
        access_token=token,
        role=person.role,
        user_id=person.id,
        expires_in=86400,
    )


@app.post("/api/v1/auth/register/donor", status_code=201)
async def register_donor(body: DonorRegisterIn, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Person).where(Person.phone == body.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Phone already registered")

    person_id = str(uuid.uuid4())
    person = Person(
        id=person_id, role="donor", name=body.name,
        phone=body.phone, language=body.language, city=body.city
    )
    donor = Donor(id=str(uuid.uuid4()), person_id=person_id)
    profile = AntigenProfile(
        id=str(uuid.uuid4()),
        person_id=person_id,
        **body.antigen_profile.model_dump(),
        genotyped_at=datetime.utcnow()
    )
    db.add_all([person, donor, profile])
    await db.commit()

    token = create_access_token({"sub": person_id, "role": "donor", "name": body.name})
    return {"user_id": person_id, "access_token": token, "token_type": "bearer"}


@app.post("/api/v1/auth/register/patient", status_code=201)
async def register_patient(body: PatientRegisterIn, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Person).where(Person.phone == body.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Phone already registered")

    person_id = str(uuid.uuid4())
    person = Person(
        id=person_id, role="patient", name=body.name,
        phone=body.phone, language=body.language, city=body.city
    )
    patient = Patient(
        id=str(uuid.uuid4()), person_id=person_id,
        age=body.age, weight_kg=body.weight_kg,
        hospital_id=body.hospital_id,
        thalassemia_type=body.thalassemia_type,
    )
    profile = AntigenProfile(
        id=str(uuid.uuid4()),
        person_id=person_id,
        **body.antigen_profile.model_dump(),
        genotyped_at=datetime.utcnow()
    )
    db.add_all([person, patient, profile])
    await db.commit()
    return {"user_id": person_id, "patient_id": patient.id}


# ─── Proxy routes ─────────────────────────────────────────────────────────────
async def _proxy(service: str, path: str, method: str = "GET", body=None, headers=None):
    url  = f"{SERVICES[service]}{path}"
    resp = await http_client.request(method, url, json=body, headers=headers)
    return resp.json()


@app.post("/api/v1/transfusion/request")
async def create_request(
    body: dict,
    user: TokenData = Depends(get_current_user),
):
    result = await _proxy("matching", "/match/request", "POST", body)
    # Broadcast to dashboard
    await manager.broadcast("dashboard", {
        "event": "new_request",
        "data": result,
        "urgency": body.get("urgency", "normal"),
    })
    return result


@app.get("/api/v1/guardian-circle/{patient_id}")
async def get_guardian_circle(
    patient_id: str,
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("matching", f"/guardian-circle/{patient_id}")


@app.get("/api/v1/patients")
async def get_all_patients(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    # Get all patients ordered by newest first
    result = await db.execute(
        select(Patient, Person)
        .join(Person, Patient.person_id == Person.id)
        .order_by(Patient.created_at.desc())
    )
    rows = result.all()
    patients = []
    for pat, per in rows:
        patients.append({
            "id": pat.id,
            "name": per.name,
            "age": pat.age,
            "city": per.city,
            "hospital": "Mumbai Thalassemia Center", # Defaulting for now
            "thalassemia_type": pat.thalassemia_type,
            "transfusion_interval_days": pat.transfusion_interval_days
        })
    return patients


@app.get("/api/v1/patients/{patient_id}")
async def get_patient_by_id(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    result = await db.execute(
        select(Patient, Person, AntigenProfile)
        .join(Person, Patient.person_id == Person.id)
        .outerjoin(AntigenProfile, AntigenProfile.person_id == Person.id)
        .where(Patient.id == patient_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
        
    pat, per, profile = row
    return {
        "id": pat.id,
        "name": per.name,
        "age": pat.age,
        "city": per.city,
        "hospital": "Mumbai Thalassemia Center", # Default
        "thalassemia_type": pat.thalassemia_type,
        "transfusion_interval_days": pat.transfusion_interval_days,
        "abo": profile.abo if profile else "B",
        "rh_d": profile.rh_d if profile else True,
        "total_transfusions": 12, # Demo value
        "circle_health": 0.92     # Demo value
    }


@app.get("/api/v1/churn/batch")
async def get_churn_predictions(
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("prediction", "/churn/batch")


@app.get("/api/v1/demo/summary")
async def get_demo_summary(
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("prediction", "/demo/summary")


@app.get("/api/v1/hb-forecast/{patient_id}")
async def get_hb_forecast(
    patient_id: str,
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("prediction", f"/hb-forecast/{patient_id}")


@app.post("/api/v1/notify/donor")
async def notify_donor(
    body: dict,
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("notification", "/notify/donor", "POST", body)


@app.get("/api/v1/story/{donor_id}/{patient_id}")
async def get_story(
    donor_id: str,
    patient_id: str,
    language: str = "hi",
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("story", f"/story/{donor_id}/{patient_id}?language={language}")


@app.get("/api/v1/dashboard/stats")
async def get_dashboard_stats(user: TokenData = Depends(get_current_user)):
    return await _proxy("analytics", "/stats")


@app.get("/api/v1/inventory")
async def get_inventory(user: TokenData = Depends(get_current_user)):
    return await _proxy("analytics", "/inventory")


# ── Frontend-facing /api/v1/admin/* proxy routes ──────────────────────────────
# Lets the React app call /api/v1/admin/... through the same base URL.
@app.get("/api/v1/admin/alerts/summary")
async def api_alert_summary(user: TokenData = Depends(get_current_user)):
    from upgrade6_past_due_alerts import get_alert_summary
    return await get_alert_summary()


@app.post("/api/v1/admin/alerts/scan")
async def api_alert_scan(user: TokenData = Depends(get_current_user)):
    from upgrade6_past_due_alerts import run_alert_scan
    return await run_alert_scan()


@app.post("/api/v1/admin/alerts/cascade/{patient_id}")
async def api_cascade_patient(
    patient_id: str,
    urgency: str = "urgent",
    user: TokenData = Depends(get_current_user),
):
    from upgrade6_past_due_alerts import trigger_cascade_for_patient
    return await trigger_cascade_for_patient(patient_id, urgency)


@app.get("/api/v1/admin/guest-pool/stats")
async def api_guest_stats(user: TokenData = Depends(get_current_user)):
    from upgrade2_guest_activator import guest_pool_stats
    return await guest_pool_stats()


@app.post("/api/v1/admin/activate-guests")
async def api_activate_guests(
    body: dict = {},
    user: TokenData = Depends(get_current_user),
):
    from upgrade2_guest_activator import ActivateGuestsIn, activate_guests
    from shared.db import get_db
    # Use async generator manually to get the db session
    db_gen = get_db()
    db = await db_gen.__anext__()
    try:
        return await activate_guests(
            ActivateGuestsIn(
                blood_group=body.get("blood_group"),
                limit=body.get("limit", 100),
            ),
            db=db,
        )
    finally:
        await db_gen.aclose()


# ── Frontend-facing /api/v1/agent/* routes ────────────────────────────────────
@app.post("/api/v1/agent/run")
async def api_agent_run(
    body: dict,
):
    from agent.orchestrator import run_supervisor
    messages = body.get("messages")
    if not messages:
        messages = [{"role": "user", "content": [{"text": body.get("task", "")}]}]
    return await run_supervisor(messages, body.get("context", {}))


@app.post("/api/v1/agent/scheduled")
async def api_agent_scheduled(
    body: dict,
    user: TokenData = Depends(get_current_user),
):
    from agent.orchestrator import run_scheduled
    from pydantic import BaseModel
    class _In(BaseModel):
        trigger: str
    return await run_scheduled(_In(trigger=body.get("trigger", "daily_churn_scan")))


@app.get("/api/v1/agent/status")
async def api_agent_status():
    from agent.orchestrator import agent_status
    return await agent_status()


# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await manager.connect(websocket, "dashboard")
    try:
        while True:
            # Keep alive ping every 30s
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"event": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, "dashboard")


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "api-gateway"}


# Internal broadcast endpoint (called by other services)
@app.post("/internal/broadcast")
async def internal_broadcast(body: dict):
    await manager.broadcast_all(body)
    return {"ok": True}
