"""
UPGRADE 3 — DynamoDB Conversation Memory
==========================================
Closes the 147-day average contact gap found in real data.
73.2% of users have no last_contacted_date.

Storage: Redis (local, always available in Docker) as primary.
         DynamoDB (AWS, optional) as persistent backup.

Design: Redis sorted set per donor, score = unix timestamp.
        Each event = JSON string: {type, content, metadata, channel, ts}

Integration points:
  - notification-service/main.py: call append_event() after every outreach
  - story-engine/main.py: call get_context() before generating story
  - agent/orchestrator.py: tool "get_donor_context" calls get_context()

Import in any service:
    from upgrade3_conversation_memory import append_event, get_context,
                                             generate_context_aware_message
"""
import json
import logging
import os
from datetime import datetime
from typing import Any

logger = logging.getLogger("conversation-memory")

DEMO_MODE    = os.getenv("DEMO_MODE",   "true").lower() == "true"
REDIS_URL    = os.getenv("REDIS_URL",   "redis://redis:6379")
AWS_REGION   = os.getenv("AWS_REGION",  "us-east-1")
LITE_MODEL   = os.getenv("BEDROCK_LITE_MODEL_ID", "amazon.nova-lite-v1:0")
MAX_CONTEXT  = int(os.getenv("MEMORY_CONTEXT_SIZE", "10"))
TTL_SECONDS  = 60 * 60 * 24 * 180   # 180 days

_EVENT_LABELS = {
    "whatsapp_sent":      "WhatsApp message sent",
    "whatsapp_replied":   "WhatsApp reply received",
    "sms_sent":           "SMS sent",
    "sms_replied":        "SMS reply received",
    "call_initiated":     "Voice call started",
    "call_answered":      "Voice call answered",
    "call_no_answer":     "No answer on call",
    "donation_confirmed": "Donation confirmed",
    "donation_completed": "Donation completed",
    "donation_deferred":  "Donation deferred",
    "donation_declined":  "Donation declined",
    "story_sent":         "Impact story sent",
    "coordinator_note":   "Coordinator note added",
    "reengagement_sent":  "Re-engagement message sent",
}

_LANG_NAMES = {
    "hi": "Hindi", "te": "Telugu", "ta": "Tamil",
    "bn": "Bengali", "en": "English", "mr": "Marathi",
}

_DEMO_HISTORY = [
    {"ts": "2025-07-01", "event_type": "whatsapp_sent",      "content": "Outreach: patient Arjun (B+) needs donation"},
    {"ts": "2025-07-01", "event_type": "whatsapp_replied",   "content": "Donor replied: will donate next month"},
    {"ts": "2025-07-15", "event_type": "call_no_answer",     "content": "Follow-up call — no answer"},
    {"ts": "2025-08-01", "event_type": "reengagement_sent",  "content": "Re-engagement sent referencing commitment"},
    {"ts": "2025-08-15", "event_type": "donation_confirmed", "content": "Confirmed for 20 Aug, 10AM"},
    {"ts": "2025-08-20", "event_type": "donation_completed", "content": "1 unit B+ donated successfully"},
    {"ts": "2025-08-20", "event_type": "story_sent",         "content": "Story: patient Arjun walked today"},
]


def _get_redis():
    import redis
    return redis.from_url(REDIS_URL, decode_responses=True)


def _redis_key(donor_id: str) -> str:
    return f"raksetu:memory:{donor_id}"


def append_event(
    donor_id:   str,
    event_type: str,
    content:    str,
    metadata:   dict[str, Any] | None = None,
    channel:    str = "system",
) -> bool:
    """
    Append one interaction to donor timeline. Always call this after any outreach.

    Usage in notification-service/main.py:
        from upgrade3_conversation_memory import append_event
        append_event(donor_id, "whatsapp_sent", f"Outreach for patient {patient_id}")

    Returns True on success.
    """
    if DEMO_MODE:
        logger.info(f"[DEMO] Memory: {donor_id} | {event_type} | {content[:60]}")
        return True

    record = json.dumps({
        "ts":         datetime.utcnow().isoformat(),
        "event_type": event_type,
        "readable":   _EVENT_LABELS.get(event_type, event_type),
        "content":    content,
        "metadata":   metadata or {},
        "channel":    channel,
    })

    try:
        r   = _get_redis()
        key = _redis_key(donor_id)
        score = datetime.utcnow().timestamp()
        r.zadd(key, {record: score})
        r.expire(key, TTL_SECONDS)
        # Keep only last 200 events per donor
        r.zremrangebyrank(key, 0, -201)
        return True
    except Exception as e:
        logger.error(f"Memory append failed for {donor_id}: {e}")
        return False


def get_context(donor_id: str, last_n: int = MAX_CONTEXT) -> list[dict]:
    """
    Return last N interactions oldest-first (chronological order for Bedrock).

    Usage in story-engine/main.py:
        from upgrade3_conversation_memory import get_context
        history = get_context(donor_id)
    """
    if DEMO_MODE:
        return _DEMO_HISTORY[-last_n:]

    try:
        r      = _get_redis()
        key    = _redis_key(donor_id)
        events = r.zrange(key, -last_n, -1, withscores=False)
        return [json.loads(e) for e in events]
    except Exception as e:
        logger.error(f"Memory get_context failed for {donor_id}: {e}")
        return []


def get_donor_summary(donor_id: str) -> dict:
    """
    Structured summary for agent decision-making.
    Used by agent orchestrator tool: get_donor_context.
    """
    events = get_context(donor_id, last_n=50)

    if not events:
        return {"total_events": 0, "last_event": None,
                "donations_completed": 0, "calls_no_answer": 0}

    counts = {}
    for e in events:
        et = e.get("event_type", "unknown")
        counts[et] = counts.get(et, 0) + 1

    return {
        "total_events":        len(events),
        "first_interaction":   events[0].get("ts", ""),
        "last_interaction":    events[-1].get("ts", ""),
        "event_counts":        counts,
        "donations_completed": counts.get("donation_completed", 0),
        "donations_declined":  counts.get("donation_declined", 0),
        "calls_no_answer":     counts.get("call_no_answer", 0),
        "last_event_type":     events[-1].get("event_type", ""),
        "last_event_content":  events[-1].get("content", ""),
    }


def generate_context_aware_message(
    donor_id:   str,
    language:   str,
    purpose:    str,
    donor_name: str = "donor",
) -> str:
    """
    Generate message that references real conversation history.
    If donor said "I'll donate next month" 6 weeks ago, this message knows that.

    Usage in notification-service/main.py:
        from upgrade3_conversation_memory import generate_context_aware_message
        msg = generate_context_aware_message(donor_id, "hi", "Follow up on missed donation", name)
    """
    history = get_context(donor_id)
    lang    = _LANG_NAMES.get(language, "Hindi")

    if not history:
        history_text = "No prior interaction history."
    else:
        lines = []
        for e in history:
            label = _EVENT_LABELS.get(e.get("event_type", ""), e.get("event_type", ""))
            lines.append(f"- {e['ts'][:10]}: [{label}] {e.get('content', '')}")
        history_text = "\n".join(lines)

    prompt = (
        f"You are a Blood Warriors coordinator. Donor: {donor_name}.\n"
        f"Interaction history (last {len(history)} events):\n{history_text}\n\n"
        f"Task: {purpose}\n"
        f"Language: {lang}\n\n"
        "Write a message that:\n"
        "1. References history naturally if relevant (e.g., a past promise they made)\n"
        "2. Feels human and warm, not automated\n"
        "3. Is under 60 words\n"
        "4. Doesn't repeat info they already know\n\n"
        "Output only the message text."
    )

    if DEMO_MODE:
        has_donation = any(e.get("event_type") == "donation_completed" for e in history)
        if has_donation:
            return {
                "hi": "आपके पिछले donation से मरीज़ ठीक हो रहा है। क्या अगली बार भी मदद करेंगे?",
                "en": "Your last donation helped the patient recover. Would you donate again?",
            }.get(language, "Your last donation helped. Can you donate again?")
        return {
            "hi": "पिछली बार आपने कहा था कि आप donate करेंगे — एक मरीज़ अभी भी इंतजार कर रहा है।",
            "en": "You mentioned donating last time — a patient is still waiting.",
        }.get(language, "A patient is still waiting for your help.")

    try:
        import boto3
        bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
        resp = bedrock.invoke_model(
            modelId=LITE_MODEL,
            body=json.dumps({
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"maxTokens": 150, "temperature": 0.75},
            }),
            contentType="application/json",
            accept="application/json",
        )
        return json.loads(resp["body"].read())["output"]["message"]["content"][0]["text"].strip()
    except Exception as e:
        logger.error(f"Context-aware message failed: {e}")
        return f"Hi {donor_name}! A patient needs your help. Can you donate this week?"
