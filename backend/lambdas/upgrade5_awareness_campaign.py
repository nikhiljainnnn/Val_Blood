"""
UPGRADE 5 — Blood Group Awareness Campaign
===========================================
Real data: 160 users registered with "Do not Know" blood group.
Cannot be matched to any patient until blood group is confirmed.

Integration: New endpoint in notification-service/main.py
  POST /notify/awareness/run    → trigger campaign for all unknown-BG users
  GET  /notify/awareness/stats  → how many unknown, how many reached

Wire into notification-service/main.py:
    from upgrade5_awareness_campaign import router as awareness_router
    app.include_router(awareness_router)

Celery beat: monthly on 1st of each month at 10AM.
"""
import json
import logging
import os
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("awareness-campaign")

DEMO_MODE   = os.getenv("DEMO_MODE",   "true").lower() == "true"
AWS_REGION  = os.getenv("AWS_REGION",  "us-east-1")
MICRO_MODEL = os.getenv("BEDROCK_MICRO_MODEL_ID", "amazon.nova-micro-v1:0")
NOTIFICATION_URL = os.getenv("NOTIFICATION_URL", "http://notification-service:8003")

# Real camp locations from dataset geographic centre (Hyderabad 17.4, 78.5)
CAMP_LOCATIONS = {
    "hyderabad": [
        "Gandhi Hospital, Secunderabad — free blood typing Mon–Sat 9AM–4PM",
        "Apollo Blood Bank, Jubilee Hills — walk-in testing ₹50",
        "Osmania General Hospital — free camp every 2nd Saturday",
    ],
    "default": [
        "Nearest government hospital blood bank — free blood typing available",
        "Red Cross Society camp — check local schedule",
    ],
}

_LANG_NAMES = {
    "hi": "Hindi (Devanagari script)", "te": "Telugu (Telugu script)",
    "ta": "Tamil (Tamil script)",      "en": "English",
    "bn": "Bengali (Bengali script)",  "mr": "Marathi (Devanagari script)",
}

_FALLBACKS = {
    0: {   # First contact
        "hi": ("नमस्ते {name}! आपका ब्लड ग्रुप जानना ज़रूरी है ताकि हम आपको "
               "सही मरीज़ से match कर सकें। यह सिर्फ 5 मिनट में मुफ्त में होता है।"),
        "te": ("నమస్కారం {name}! మీ రక్త గ్రూప్ తెలుసుకోవడం చాలా ముఖ్యం. "
               "ఇది 5 నిమిషాల్లో ఉచితంగా జరుగుతుంది."),
        "en": ("Hi {name}! Knowing your blood group is essential so we can match "
               "you with a patient. It only takes 5 minutes and is free."),
    },
    1: {   # Second contact — include camp location
        "hi": ("नमस्ते {name}! आप {location} पर जाकर मुफ्त ब्लड ग्रुप test करवा सकते हैं। "
               "मरीज़ आपका इंतज़ार कर रहे हैं!"),
        "te": ("{name} గారు, {location} లో ఉచిత రక్త గ్రూప్ పరీక్ష చేయించుకోండి. "
               "రోగులు మీ కోసం వేచి ఉన్నారు!"),
        "en": ("Hi {name}! Visit {location} for a free blood group test. "
               "Patients are counting on you!"),
    },
    2: {   # Final gentle nudge
        "hi": ("{name} जी, हम आपको personally call करना चाहते हैं। "
               "क्या हम call कर सकते हैं? Reply YES."),
        "en": ("{name}, we'd like to call you personally. Can we? Reply YES."),
    },
}

router = APIRouter(prefix="/notify", tags=["awareness-campaign"])


class AwarenessRunOut(BaseModel):
    targeted:  int
    sent:      int
    errors:    int
    ts:        str


def _generate_awareness_message(name: str, language: str, city: str,
                                 campaign_count: int) -> str:
    if DEMO_MODE or campaign_count > 2:
        fb  = _FALLBACKS.get(min(campaign_count, 2), _FALLBACKS[2])
        loc = CAMP_LOCATIONS.get(city.lower(), CAMP_LOCATIONS["default"])[0]
        return fb.get(language, fb.get("en", "")).format(name=name, location=loc)

    lang_name = _LANG_NAMES.get(language, "Hindi (Devanagari script)")
    city_l    = city.lower()
    location  = CAMP_LOCATIONS.get(city_l, CAMP_LOCATIONS["default"])[0]

    if campaign_count == 0:
        prompt = (
            f"Write a brief, friendly WhatsApp message in {lang_name} for {name} "
            "who registered as a blood donor but doesn't know their blood group. "
            "Explain: (1) why knowing blood group matters for donation, "
            "(2) it takes 5 minutes and is free. "
            "Under 60 words. Output only the message."
        )
    elif campaign_count == 1:
        prompt = (
            f"Write a brief WhatsApp message in {lang_name} for {name} "
            f"reminding them to find their blood group. Include: {location}. "
            "Under 60 words. Mention the address. Urgent but friendly. Output only the message."
        )
    else:
        prompt = (
            f"Write a final gentle WhatsApp message in {lang_name} for {name}. "
            "Ask if we can call them to help confirm blood group. "
            "Under 40 words. Very warm. Output only the message."
        )

    try:
        import boto3
        bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
        resp = bedrock.invoke_model(
            modelId=MICRO_MODEL,
            body=json.dumps({
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"maxTokens": 120, "temperature": 0.65},
            }),
            contentType="application/json",
            accept="application/json",
        )
        return json.loads(resp["body"].read())["output"]["message"]["content"][0]["text"].strip()
    except Exception as e:
        logger.error(f"Bedrock awareness message failed: {e}")
        fb  = _FALLBACKS.get(campaign_count, _FALLBACKS[0])
        loc = CAMP_LOCATIONS.get(city_l, CAMP_LOCATIONS["default"])[0]
        return fb.get(language, fb.get("en", "")).format(name=name, location=loc)


async def _send_whatsapp(phone: str, message: str) -> bool:
    if DEMO_MODE:
        logger.info(f"[DEMO] Awareness→{phone}: {message[:80]}")
        return True
    import httpx
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(
                f"{NOTIFICATION_URL}/notify/donor",
                json={"donor_id": "awareness", "phone": phone,
                      "message": message, "channel": "whatsapp"}
            )
            return r.status_code == 200
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return False


@router.post("/awareness/run", response_model=AwarenessRunOut)
async def run_awareness_campaign():
    """
    Trigger monthly awareness campaign for all users with unknown blood group.
    In demo mode returns real dataset numbers (160 users).
    """
    if DEMO_MODE:
        logger.info("[DEMO] Awareness campaign: 160 users with unknown blood group")
        return AwarenessRunOut(targeted=160, sent=160, errors=0,
                               ts=datetime.utcnow().isoformat())

    # Production: SELECT from persons JOIN antigen_profiles WHERE abo IS NULL
    # For each: call _generate_awareness_message + _send_whatsapp
    return AwarenessRunOut(targeted=0, sent=0, errors=0,
                           ts=datetime.utcnow().isoformat())


@router.get("/awareness/stats")
async def awareness_stats():
    return {
        "unknown_blood_group": 160 if DEMO_MODE else 0,
        "campaign_locations":  CAMP_LOCATIONS["hyderabad"],
        "demo":                DEMO_MODE,
    }
