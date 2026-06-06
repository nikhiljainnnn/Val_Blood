"""
UPGRADE 1 — Self-Improving Failure Learning
============================================
Wires into notification-service/main.py as a background task.
Called after every failed donor outreach (no WhatsApp reply, no SMS reply, no call answer).

Integration: POST /notify/failure-learn  (new endpoint in notification-service)
Also runs as a standalone Celery task: failure_learn_task.delay(donor_id, ...)

Data-backed from real Blood Warriors dataset:
  3 calls = inflection point → 65% donation rate
  321 donors: "Very limited activity despite multiple calls" → switch channel
  361 donors: "Not donated in last 1 year" → emotional re-engagement
  Two trigger patterns → two distinct Bedrock message strategies

In DEMO_MODE: logs decisions, skips Bedrock + DynamoDB calls.
"""
import json
import logging
import os
from datetime import datetime

logger = logging.getLogger("failure-learner")

DEMO_MODE   = os.getenv("DEMO_MODE", "true").lower() == "true"
REDIS_URL   = os.getenv("REDIS_URL", "redis://redis:6379")
AWS_REGION  = os.getenv("AWS_REGION", "us-east-1")
MICRO_MODEL = os.getenv("BEDROCK_MICRO_MODEL_ID", "amazon.nova-micro-v1:0")

# ── Protocol matrix (derived from real data analysis) ─────────────────────────
# (min_calls, min_days_inactive) → (next_action, wait_hours)
# Ordered most-specific first
_PROTOCOLS = [
    ((5, 365), "dormant_pool_quarterly",            720),
    ((5,  90), "reactivation_bedrock_personalised",  72),
    ((3,  30), "personal_coordinator_visit",          24),
    ((3,   0), "initiate_voice_call",                 12),
    ((2,   0), "switch_to_sms",                        6),
    ((1,   0), "resend_whatsapp_different_slot",        4),
    ((0,   0), "send_whatsapp_first",                   2),
]

# ── Two strategies from real failure trigger comments ─────────────────────────
_PROMPTS = {
    "year_lapse": (
        "Write a warm WhatsApp message in {lang} for a blood donor who donated "
        "about 1 year ago but has been inactive. Under 50 words. Do NOT mention the gap. "
        "Focus on a patient currently waiting for them. Make them feel missed, not guilty. "
        "Output only the message text."
    ),
    "channel_switch": (
        "Write a very short WhatsApp message in {lang} for a donor who has not responded "
        "to multiple calls. Under 30 words. Ask one yes/no question: are they still "
        "interested in helping? Suggest they reply YES or NO. Output only the message text."
    ),
    "general": (
        "Write a warm WhatsApp re-engagement message in {lang} for an "
        "inactive blood donor. Under 50 words. Output only the message text."
    ),
}

_FALLBACKS = {
    "hi": "नमस्ते! एक मरीज़ को आपकी ज़रूरत है। क्या आप इस हफ्ते donate कर सकते हैं?",
    "te": "నమస్కారం! ఒక రోగికి మీ సహాయం కావాలి. ఈ వారం donate చేయగలరా?",
    "ta": "வணக்கம்! ஒரு நோயாளிக்கு உதவி தேவை. இந்த வாரம் donate செய்ய முடியுமா?",
    "bn": "হ্যালো! একজন রোগীর আপনার সাহায্য দরকার। এই সপ্তাহে donate করতে পারবেন?",
    "en": "Hi! A patient needs your help. Can you donate this week?",
}

_LANG_NAMES = {
    "hi": "Hindi (Devanagari script)",
    "te": "Telugu (Telugu script)",
    "ta": "Tamil (Tamil script)",
    "bn": "Bengali (Bengali script)",
    "en": "English",
    "mr": "Marathi (Devanagari script)",
}


def select_protocol(calls: int, days_inactive: int) -> tuple[str, int]:
    """Return (next_action, wait_hours) for given donor state."""
    for (min_c, min_d), action, wait in _PROTOCOLS:
        if calls >= min_c and days_inactive >= min_d:
            return action, wait
    return "send_whatsapp_first", 2


def classify_trigger(trigger_comment: str) -> str:
    t = trigger_comment.lower()
    if "1 year" in t or "one year" in t:
        return "year_lapse"
    if "limited activity" in t or "multiple calls" in t:
        return "channel_switch"
    return "general"


def generate_reengagement_message(strategy: str, language: str) -> str:
    """Generate personalised re-engagement via Bedrock Nova Micro. Falls back to template."""
    if DEMO_MODE:
        logger.info(f"[DEMO] generate_reengagement: strategy={strategy}, lang={language}")
        return _FALLBACKS.get(language, _FALLBACKS["en"])

    try:
        import boto3
        bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
        lang_name = _LANG_NAMES.get(language, "Hindi (Devanagari script)")
        prompt = _PROMPTS[strategy].format(lang=lang_name)

        resp = bedrock.invoke_model(
            modelId=MICRO_MODEL,
            body=json.dumps({
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"maxTokens": 120, "temperature": 0.7},
            }),
            contentType="application/json",
            accept="application/json",
        )
        text = json.loads(resp["body"].read())
        return text["output"]["message"]["content"][0]["text"].strip()
    except Exception as e:
        logger.error(f"Bedrock reengagement failed: {e}")
        return _FALLBACKS.get(language, _FALLBACKS["en"])


def log_failure_to_redis(redis_client, donor_id: str, calls: int, days: int,
                          action: str, trigger: str) -> None:
    """
    Log failure event to Redis sorted set (used by weekly retrain job).
    Key: failure_log:{donor_id}   Score: unix timestamp
    """
    if DEMO_MODE:
        logger.info(f"[DEMO] Failure logged: donor={donor_id}, action={action}")
        return

    record = json.dumps({
        "donor_id": donor_id,
        "calls":    calls,
        "days":     days,
        "action":   action,
        "trigger":  trigger,
        "ts":       datetime.utcnow().isoformat(),
    })
    try:
        import redis as redis_lib
        r = redis_lib.from_url(REDIS_URL, decode_responses=True)
        score = datetime.utcnow().timestamp()
        r.zadd("raksetu:failure_log", {record: score})
        # Trim to last 10,000 entries
        r.zremrangebyrank("raksetu:failure_log", 0, -10001)
    except Exception as e:
        logger.error(f"Redis failure log error: {e}")


def store_reengagement_in_redis(redis_client, donor_id: str, message: str,
                                 strategy: str) -> None:
    """Store generated re-engagement message for next outreach cycle."""
    if DEMO_MODE:
        logger.info(f"[DEMO] Re-engagement stored for {donor_id}: {message[:60]}")
        return
    try:
        import redis as redis_lib
        r = redis_lib.from_url(REDIS_URL, decode_responses=True)
        r.setex(
            f"raksetu:reengage:{donor_id}",
            259200,  # 72 hours TTL
            json.dumps({"message": message, "strategy": strategy,
                        "ts": datetime.utcnow().isoformat()}),
        )
    except Exception as e:
        logger.error(f"Redis reengage store error: {e}")


def run(
    donor_id: str,
    calls_attempted: int,
    days_since_last_donation: int,
    inactive_trigger_comment: str,
    language: str,
    redis_client=None,
) -> dict:
    """
    Main entry point. Called from:
      - notification-service/main.py (background task after cascade failure)
      - Celery task (async via celery_tasks.py)
      - Agent orchestrator tool call

    Returns the selected protocol for the caller to act on.
    """
    action, wait_hours = select_protocol(calls_attempted, days_since_last_donation)
    strategy = classify_trigger(inactive_trigger_comment)

    logger.info(
        f"Failure learning: donor={donor_id}, calls={calls_attempted}, "
        f"days={days_since_last_donation}, action={action}, strategy={strategy}"
    )

    # Log failure for model retraining
    log_failure_to_redis(redis_client, donor_id, calls_attempted,
                         days_since_last_donation, action, inactive_trigger_comment)

    # Generate personalised message for chronic non-responders
    reengagement_message = None
    if action == "reactivation_bedrock_personalised":
        reengagement_message = generate_reengagement_message(strategy, language)
        store_reengagement_in_redis(redis_client, donor_id, reengagement_message, strategy)

    return {
        "donor_id":            donor_id,
        "next_action":         action,
        "wait_hours":          wait_hours,
        "strategy":            strategy,
        "reengagement_message": reengagement_message,
    }


# ── FastAPI endpoint (mounted in notification-service/main.py) ─────────────────
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/notify", tags=["failure-learning"])


class FailureLearnIn(BaseModel):
    donor_id:                 str
    calls_attempted:          int
    days_since_last_donation: int
    inactive_trigger_comment: str = ""
    language:                 str = "hi"


@router.post("/failure-learn")
async def failure_learn_endpoint(body: FailureLearnIn):
    """
    Called by Step Functions / cascade runner after every failed outreach.
    Add to notification-service/main.py:
        from upgrade1_failure_learner import router as failure_router
        app.include_router(failure_router)
    """
    result = run(
        donor_id=body.donor_id,
        calls_attempted=body.calls_attempted,
        days_since_last_donation=body.days_since_last_donation,
        inactive_trigger_comment=body.inactive_trigger_comment,
        language=body.language,
    )
    return result
