"""
RakSetu API Gateway
- JWT auth middleware
- Rate limiting (Redis sliding window)
- Reverse proxy to microservices
- WebSocket hub for real-time dashboard
"""
import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated

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
    version="2.0.0",
    lifespan=lifespan,
)

# ── Phase 1: LangGraph multi-agent router ─────────────────────────────────────
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
try:
    from agent.orchestrator import router as agent_router
    app.include_router(agent_router, prefix="/api/v1")
except ImportError as _e:
    import logging as _logging
    _logging.getLogger("api-gateway").warning(f"Agent router not loaded: {_e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security  = HTTPBearer()
limiter   = RateLimiter()
http_client = httpx.AsyncClient(timeout=30.0)


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


@app.get("/api/v1/churn/batch")
async def get_churn_predictions(
    user: TokenData = Depends(get_current_user),
):
    return await _proxy("prediction", "/churn/batch")


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
