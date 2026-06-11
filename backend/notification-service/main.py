"""
RakSetu Notification Service
- WhatsApp → SMS → Voice cascade with Celery
- Multilingual templates (5 languages)
- Donor response tracking
- UPGRADE 1: Self-improving failure learning (POST /notify/failure-learn)
- UPGRADE 3: Conversation memory (appended after every outreach)
- UPGRADE 5: Blood group awareness campaign (POST /notify/awareness/run)
"""
import os
import sys
import json
import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

# Load secrets from SSM Parameter Store before initializing anything else
from shared.ssm_loader import load_ssm_parameters
load_ssm_parameters()

from shared.db import get_db, init_db
from shared.models import DonorSignal, Person, Donor
from shared.redis_client import get_redis
from shared.schemas import NotificationIn, NotificationOut
from gupshup_client import GupshupClient
from sns_client import SNSClient
from templates import get_template, get_sms_template

# ── Upgrade wiring ────────────────────────────────────────────────────────────
_LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), 'lambdas')
if not os.path.exists(_LAMBDAS_DIR):
    _LAMBDAS_DIR = os.path.join(os.path.dirname(__file__), '..', 'lambdas')
sys.path.insert(0, _LAMBDAS_DIR)
from upgrade1_failure_learner import router as failure_router    # noqa: E402
from upgrade3_conversation_memory import append_event            # noqa: E402
from upgrade5_awareness_campaign import router as awareness_router  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("notification-service")

redis = get_redis()

# Celery for async retry queues
CELERY_BROKER = os.getenv("CELERY_BROKER", "redis://redis:6379/1")
celery_app = Celery("raksetu_notifications", broker=CELERY_BROKER)
celery_app.conf.task_serializer        = "json"
celery_app.conf.result_serializer      = "json"
celery_app.conf.accept_content         = ["json"]
celery_app.conf.task_acks_late         = True
celery_app.conf.worker_prefetch_multiplier = 1

# ── Phase 2: MLOps Celery Tasks & Beat Schedule ───────────────────────────────
try:
    import celery_tasks_mlops
    if hasattr(celery_app.conf, "beat_schedule") and celery_app.conf.beat_schedule:
        celery_app.conf.beat_schedule.update(celery_tasks_mlops.MLOPS_BEAT_SCHEDULE)
    else:
        celery_app.conf.beat_schedule = celery_tasks_mlops.MLOPS_BEAT_SCHEDULE
except Exception as e:
    logger.warning(f"Could not load MLOps celery tasks: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.gupshup = GupshupClient()
    app.state.sns = SNSClient()
    logger.info("Notification service started")
    yield


app = FastAPI(title="RakSetu Notification Service", version="1.0.0", lifespan=lifespan)

# ── Mount upgrade routers ─────────────────────────────────────────────────────
app.include_router(failure_router)    # POST /notify/failure-learn
app.include_router(awareness_router)  # POST /notify/awareness/run, GET /notify/awareness/stats


@app.post("/notify/donor", response_model=NotificationOut)
async def notify_donor(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Fire notification cascade for a single donor.
    Returns immediately after first channel sent; Celery handles fallback.
    """
    import os
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        logger.info(f"[DEMO] Simulated notification to donor {body.get('donor_id')}")
        return NotificationOut(
            notification_id="demo_notif_123",
            donor_id=body.get("donor_id", "demo_donor"),
            channels_fired=["whatsapp"],
            status="sent",
            created_at=datetime.utcnow()
        )

    import uuid
    from sqlalchemy.exc import StatementError

    donor_id_str = body.get("donor_id", "")
    row = None
    try:
        uuid.UUID(donor_id_str)
        result = await db.execute(
            select(Person, Donor)
            .join(Donor, Donor.person_id == Person.id)
            .where(Donor.id == donor_id_str)
        )
        row = result.first()
    except (ValueError, StatementError, TypeError):
        pass

    if not row:
        # Mock the person so custom phone number testing works even with fake donor_ids!
        class MockPerson:
            name = "Test Donor"
            language = "en"
            phone = body.get("phone", "+910000000000")
        class MockDonor:
            karma_score = 10
            id = donor_id_str
        person, donor = MockPerson(), MockDonor()
    else:
        person, donor = row
    lang  = person.language or "hi"
    phone = body.get("phone") or person.phone

    # Pull patient story from cache / story engine
    story = await _get_story(body.get("donor_id"), body.get("patient_id"), lang)
    slot  = body.get("slot_time") or _next_slot_str()

    # Build WhatsApp message
    wa_msg = get_template(
        channel="whatsapp",
        language=lang,
        donor_name=person.name,
        story_snippet=story,
        slot=slot,
        karma=donor.karma_score,
    )

    notification_id = str(uuid.uuid4())

    # Track state in Redis (for cascade to check if donor already replied)
    state_key = f"notif:state:{notification_id}"
    await redis.setex(
        state_key,
        86400,   # 24h TTL
        json.dumps({
            "donor_id":   body.get("donor_id"),
            "request_id": body.get("request_id"),
            "replied":    False,
            "channel":    "whatsapp",
            "sent_at":    datetime.utcnow().isoformat(),
        })
    )

    # Send WhatsApp (primary channel)
    gupshup  = app.state.gupshup
    wa_result = await gupshup.send_whatsapp(phone, wa_msg)
    channels_fired = ["whatsapp"]

    # ── UPGRADE 3: Record in conversation memory ──────────────────────────────
    append_event(
        donor_id=body.get("donor_id", ""),
        event_type="whatsapp_sent",
        content=f"Outreach for request {body.get('request_id')} — {body.get('urgency', 'normal')} urgency",
        channel="whatsapp",
    )

    # Record signal
    signal = DonorSignal(
        donor_id=body.get("donor_id", ""),
        signal_type="msg_open",
        value={"channel": "whatsapp", "notification_id": notification_id},
    )
    db.add(signal)
    await db.commit()

    # For critical/urgent: also fire SMS immediately
    if body.get("urgency") in ["urgent", "critical"]:
        sns = app.state.sns
        sms_msg = get_sms_template(lang, person.name, slot)
        await sns.send_sms(phone, sms_msg)
        channels_fired.append("sms")

    # Schedule fallback escalations via Celery
    _schedule_sms_fallback.apply_async(
        args=[notification_id, body.get("donor_id", ""), phone, lang, slot],
        countdown=7200,   # 2 hours
    )
    _schedule_voice_fallback.apply_async(
        args=[notification_id, body.get("donor_id", ""), phone, lang],
        countdown=10800,  # 3 hours
    )

    return NotificationOut(
        notification_id=notification_id,
        donor_id=body.get("donor_id", ""),
        channels_fired=channels_fired,
        status="sent",
        created_at=datetime.utcnow(),
    )


@app.post("/webhook/gupshup")
async def gupshup_webhook(body: dict, db: AsyncSession = Depends(get_db)):
    """
    Handle incoming WhatsApp replies from Gupshup.
    Maps DTMF-style "1"/"2" replies to donor confirmation.
    """
    try:
        phone   = body.get("sender", {}).get("phone", "")
        message = body.get("message", {}).get("text", "").strip()
        logger.info(f"Incoming WA from {phone}: '{message}'")

        # Find donor by phone
        result = await db.execute(
            select(Donor, Person).join(Person, Donor.person_id == Person.id)
            .where(Person.phone == phone)
        )
        row = result.first()
        if not row:
            return {"ok": False, "reason": "donor not found"}

        donor, person = row

        if message in ["1", "हाँ", "ஆம்", "అవును", "হ্যাঁ", "yes", "Yes", "YES"]:
            await _mark_confirmed(donor.id, "whatsapp", db)
            reply = get_template(
                "whatsapp_confirm", person.language,
                donor_name=person.name
            )
        elif message in ["2", "नहीं", "இல்லை", "లేదు", "না", "no", "No"]:
            await _mark_deferred(donor.id, "whatsapp", db)
            reply = get_template(
                "whatsapp_defer", person.language,
                donor_name=person.name
            )
        else:
            reply = get_template(
                "whatsapp_clarify", person.language,
                donor_name=person.name
            )

        gupshup = GupshupClient()
        await gupshup.send_whatsapp(phone, reply)
        return {"ok": True}

    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        return {"ok": False, "error": str(e)}


@app.post("/notify/bulk")
async def notify_bulk(body: dict, db: AsyncSession = Depends(get_db)):
    """Bulk notify multiple donors (e.g., for engagement campaigns)."""
    donor_ids = body.get("donor_ids", [])
    message   = body.get("message", "")
    language  = body.get("language", "hi")

    sent = 0
    for donor_id in donor_ids:
        try:
            result = await db.execute(
                select(Person).join(Donor, Donor.person_id == Person.id)
                .where(Donor.id == donor_id)
            )
            person = result.scalar_one_or_none()
            if person:
                gupshup = GupshupClient()
                await gupshup.send_whatsapp(person.phone, message)
                sent += 1
        except Exception as e:
            logger.error(f"Bulk notify error for {donor_id}: {e}")

    return {"sent": sent, "total": len(donor_ids)}


# ─── Celery tasks ─────────────────────────────────────────────────────────────
@celery_app.task(bind=True, max_retries=3)
def _schedule_sms_fallback(self, notification_id: str, donor_id: str, phone: str, lang: str, slot: str):
    import asyncio, redis as syncredis
    r = syncredis.from_url(CELERY_BROKER.replace("/1", "/0"), decode_responses=True)
    state = json.loads(r.get(f"notif:state:{notification_id}") or "{}")

    if state.get("replied"):
        logger.info(f"Donor {donor_id} already replied — skipping SMS fallback")
        return

    sms_msg = get_sms_template(lang, "Donor", slot)
    import boto3
    import os
    
    DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
    
    # Sync publish inside Celery task
    try:
        if DEMO_MODE:
            logger.info(f"[DEMO SNS Fallback] SMS to {phone}: {sms_msg[:80]}...")
        else:
            sns_client = boto3.client(
                "sns",
                region_name=os.getenv("AWS_REGION", "us-east-1"),
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
            formatted_phone = phone if phone.startswith("+") else f"+{phone}"
            sns_client.publish(PhoneNumber=formatted_phone, Message=sms_msg)
            
        logger.info(f"SNS fallback sent to {phone}")
        # Update state
        state["channel"] = "sms"
        r.setex(f"notif:state:{notification_id}", 86400, json.dumps(state))
    except Exception as e:
        logger.error(f"SNS fallback error: {e}")
        raise self.retry(exc=e, countdown=300)


@celery_app.task(bind=True, max_retries=2)
def _schedule_voice_fallback(self, notification_id: str, donor_id: str, phone: str, lang: str):
    import redis as syncredis, requests
    r = syncredis.from_url(CELERY_BROKER.replace("/1", "/0"), decode_responses=True)
    state = json.loads(r.get(f"notif:state:{notification_id}") or "{}")

    if state.get("replied"):
        return

    try:
        requests.post(
            "http://voice-service:8004/call/initiate",
            json={"donor_id": donor_id, "phone": phone, "language": lang},
            timeout=10,
        )
        logger.info(f"Voice fallback initiated for {donor_id}")
    except Exception as e:
        logger.error(f"Voice fallback error: {e}")
        raise self.retry(exc=e, countdown=600)


# ─── Helper functions ─────────────────────────────────────────────────────────
async def _get_story(donor_id: str, patient_id: str, language: str) -> str:
    import httpx
    cache_key = f"story:{donor_id}:{patient_id}:{language}"
    cached = await redis.get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"http://story-engine:8007/story/{donor_id}/{patient_id}",
                params={"language": language},
                timeout=5.0,
            )
        story = resp.json().get("story_text", "")
        if story:
            await redis.setex(cache_key, 3600, story)
            return story
    except Exception:
        pass

    # Fallback generic
    from templates import get_generic_story
    return get_generic_story(language)


async def _mark_confirmed(donor_id: str, channel: str, db: AsyncSession):
    signal = DonorSignal(
        donor_id=donor_id,
        signal_type="donation_confirm",
        value={"channel": channel},
    )
    db.add(signal)
    await db.commit()
    logger.info(f"Donor {donor_id} confirmed via {channel}")


async def _mark_deferred(donor_id: str, channel: str, db: AsyncSession):
    signal = DonorSignal(
        donor_id=donor_id,
        signal_type="msg_reply",
        value={"channel": channel, "response": "deferred"},
    )
    db.add(signal)
    await db.commit()


def _next_slot_str() -> str:
    from datetime import timedelta
    slot = datetime.utcnow() + timedelta(days=2)
    return slot.strftime("%d %b, 10:00 AM – 2:00 PM")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "notification-service"}
