"""
RakSetu Voice Service
- Sarvam AI ASR + TTS for multilingual voice calls
- IVR state machine for donor confirmation
- DTMF fallback for feature phones
"""
import os
import json
import uuid
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime

# Load secrets from SSM Parameter Store before initializing anything else
from shared.ssm_loader import load_ssm_parameters
load_ssm_parameters()

from sarvam_client import SarvamClient
from ivr_flow import IVRSession, IVRState
from shared.redis_client import get_redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-service")
redis  = get_redis()

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.sarvam = SarvamClient()
    logger.info("Voice service started")
    yield


app = FastAPI(title="RakSetu Voice Service", version="1.0.0", lifespan=lifespan)


@app.post("/call/initiate")
async def initiate_call(body: dict):
    """
    Initiate a voice call to a donor.
    Stores IVR session state in Redis.
    """
    donor_id = body.get("donor_id")
    phone    = body.get("phone")
    language = body.get("language", "hi")
    story    = body.get("story", "")

    if not donor_id or not phone:
        raise HTTPException(status_code=400, detail="donor_id and phone required")

    session_id = str(uuid.uuid4())

    # In production: trigger actual call via Exotel/Twilio
    # For demo: log and return session for WebSocket connection
    session = IVRSession(
        session_id=session_id,
        donor_id=donor_id,
        language=language,
        story=story,
    )
    await redis.setex(
        f"ivr:session:{session_id}",
        3600,
        json.dumps(session.to_dict())
    )

    if DEMO_MODE:
        logger.info(f"[DEMO] Voice call initiated: session={session_id} donor={donor_id} lang={language}")
        return {
            "session_id": session_id,
            "status":     "initiated",
            "demo_ws_url": f"ws://localhost:8004/ivr/ws/{session_id}",
        }

    # Production: call via Exotel
    sarvam = app.state.sarvam
    result = await sarvam.initiate_call(phone, session_id)
    return {"session_id": session_id, "status": "initiated", **result}


@app.websocket("/ivr/ws/{session_id}")
async def ivr_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time IVR interaction.
    Used in demo to simulate voice call flow in browser.
    """
    await websocket.accept()
    logger.info(f"IVR WebSocket connected: {session_id}")

    try:
        # Load session
        session_data = await redis.get(f"ivr:session:{session_id}")
        if not session_data:
            await websocket.send_json({"error": "Session not found"})
            return

        session = IVRSession.from_dict(json.loads(session_data))
        sarvam  = SarvamClient()

        # Send greeting audio
        greeting_audio = await sarvam.tts(session.get_greeting_text(), session.language)
        await websocket.send_json({
            "state":     session.state.value,
            "audio_url": greeting_audio,
            "text":      session.get_greeting_text(),
        })

        while True:
            data = await websocket.receive_json()
            action = data.get("action", "dtmf")

            if action == "dtmf":
                digit  = data.get("digit", "")
                result = await session.handle_dtmf(digit, sarvam)
                await websocket.send_json(result)

                # Save updated session state
                await redis.setex(
                    f"ivr:session:{session_id}",
                    3600,
                    json.dumps(session.to_dict())
                )

                if session.state in [IVRState.CONFIRMED, IVRState.DEFER]:
                    # Notify notification service of outcome
                    import httpx
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            "http://notification-service:8003/webhook/gupshup",
                            json={
                                "sender": {"phone": session.donor_phone or ""},
                                "message": {"text": "1" if session.state == IVRState.CONFIRMED else "2"},
                            },
                            timeout=5.0,
                        )
                    await websocket.send_json({"state": "done", "confirmed": session.state == IVRState.CONFIRMED})
                    break

            elif action == "speech":
                # ASR: convert speech to text, then process
                audio_data = data.get("audio_b64", "")
                if audio_data:
                    transcript = await sarvam.asr(audio_data, session.language)
                    
                    # Fallback: simple keyword matching for intent if Lex is not available
                    digit = _transcript_to_digit(transcript, session.language)
                    intent_name = "ConfirmIntent" if digit == "1" else "DenyIntent" if digit == "2" else "Unknown"
                        
                    result = await session.handle_dtmf(digit, sarvam)
                    await websocket.send_json({**result, "transcript": transcript, "intent": intent_name})

    except WebSocketDisconnect:
        logger.info(f"IVR WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"IVR error for {session_id}: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass


@app.post("/call/dtmf-webhook")
async def dtmf_webhook(body: dict):
    """
    Handle DTMF input from telephony provider (Exotel/Twilio callback).
    """
    session_id = body.get("session_id", "")
    digit      = body.get("digit", "")

    session_data = await redis.get(f"ivr:session:{session_id}")
    if not session_data:
        return JSONResponse({"error": "Session not found"}, status_code=404)

    session = IVRSession.from_dict(json.loads(session_data))
    sarvam  = SarvamClient()
    result  = await session.handle_dtmf(digit, sarvam)

    await redis.setex(
        f"ivr:session:{session_id}",
        3600,
        json.dumps(session.to_dict())
    )
    return result


def _transcript_to_digit(transcript: str, language: str) -> str:
    """Map ASR transcript to DTMF digit for IVR intent."""
    yes_words = {
        "hi": ["हाँ", "हां", "जी", "बिल्कुल", "ठीक"],
        "ta": ["ஆம்", "சரி", "ஆமா", "ஓகே"],
        "te": ["అవును", "సరే", "ఓకే"],
        "bn": ["হ্যাঁ", "হ্যা", "জি", "ঠিক"],
        "en": ["yes", "yeah", "sure", "ok", "okay", "absolutely"],
    }
    no_words = {
        "hi": ["नहीं", "ना", "नही"],
        "ta": ["இல்லை", "வேண்டாம்"],
        "te": ["లేదు", "వద్దు"],
        "bn": ["না", "নাহ"],
        "en": ["no", "nope", "not", "can't"],
    }

    t = transcript.lower().strip()
    lang = language if language in yes_words else "en"

    for word in yes_words.get(lang, []):
        if word.lower() in t:
            return "1"
    for word in no_words.get(lang, []):
        if word.lower() in t:
            return "2"
    return ""


@app.get("/health")
async def health():
    return {"status": "ok", "service": "voice-service"}
