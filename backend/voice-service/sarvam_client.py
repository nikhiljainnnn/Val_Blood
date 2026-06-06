"""
Sarvam AI client for Indian language ASR (speech-to-text) and TTS (text-to-speech).
Falls back to gTTS for demo if Sarvam key not available.
"""
import os
import base64
import logging
import httpx

logger = logging.getLogger("sarvam-client")

SARVAM_API_KEY   = os.getenv("SARVAM_API_KEY", "")
SARVAM_BASE_URL  = "https://api.sarvam.ai"
DEMO_MODE        = os.getenv("DEMO_MODE", "false").lower() == "true"

# Sarvam language codes
LANG_MAP = {
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "bn": "bn-IN",
    "en": "en-IN",
    "mr": "mr-IN",
    "kn": "kn-IN",
    "gu": "gu-IN",
}


class SarvamClient:

    def __init__(self):
        self.api_key = SARVAM_API_KEY
        self.headers = {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def tts(self, text: str, language: str = "hi") -> str:
        """
        Convert text to speech.
        Returns: URL or base64 audio string.
        In DEMO_MODE: returns a placeholder URL.
        """
        if DEMO_MODE or not self.api_key:
            logger.info(f"[DEMO] TTS({language}): {text[:60]}...")
            # Return a pre-recorded demo audio URL
            return _get_demo_audio_url(language)

        lang_code = LANG_MAP.get(language, "hi-IN")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{SARVAM_BASE_URL}/text-to-speech",
                    headers=self.headers,
                    json={
                        "inputs":         [text],
                        "target_language_code": lang_code,
                        "speaker":        "meera" if language == "hi" else "anushka",
                        "pitch":          0,
                        "pace":           1.0,
                        "loudness":       1.5,
                        "speech_sample_rate": 8000,
                        "enable_preprocessing": True,
                        "model":          "bulbul:v1",
                    }
                )
                data = resp.json()
                if "audios" in data and data["audios"]:
                    # Return base64 audio for WebSocket streaming
                    return f"data:audio/wav;base64,{data['audios'][0]}"
                logger.error(f"Sarvam TTS unexpected response: {data}")
                return _get_demo_audio_url(language)

        except Exception as e:
            logger.error(f"Sarvam TTS error: {e}")
            return _get_demo_audio_url(language)

    async def asr(self, audio_b64: str, language: str = "hi") -> str:
        """
        Convert speech to text from base64-encoded audio.
        Returns: transcript string.
        """
        if DEMO_MODE or not self.api_key:
            logger.info(f"[DEMO] ASR({language}): returning mock transcript")
            return "हाँ" if language == "hi" else "yes"

        lang_code = LANG_MAP.get(language, "hi-IN")

        try:
            # Decode base64 to bytes
            audio_bytes = base64.b64decode(audio_b64)

            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{SARVAM_BASE_URL}/speech-to-text",
                    headers={"api-subscription-key": self.api_key},
                    files={"file": ("audio.wav", audio_bytes, "audio/wav")},
                    data={
                        "language_code": lang_code,
                        "model":         "saarika:v1",
                        "with_timestamps": False,
                    }
                )
                data = resp.json()
                transcript = data.get("transcript", "")
                logger.info(f"ASR transcript ({language}): {transcript}")
                return transcript

        except Exception as e:
            logger.error(f"Sarvam ASR error: {e}")
            return ""

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate text between Indian languages using Sarvam."""
        if DEMO_MODE or not self.api_key:
            return text  # Return original in demo

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{SARVAM_BASE_URL}/translate",
                    headers=self.headers,
                    json={
                        "input":                  text,
                        "source_language_code":   LANG_MAP.get(source_lang, "hi-IN"),
                        "target_language_code":   LANG_MAP.get(target_lang, "en-IN"),
                        "speaker_gender":         "Female",
                        "mode":                   "formal",
                        "enable_preprocessing":   True,
                        "model":                  "mayura:v1",
                    }
                )
                return resp.json().get("translated_text", text)
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return text

    async def initiate_call(self, phone: str, session_id: str) -> dict:
        """
        Initiate outbound call via telephony provider.
        In production: integrate with Exotel / Twilio / MyOperator.
        """
        if DEMO_MODE:
            return {"call_id": f"demo_{session_id[:8]}", "status": "queued"}

        # Exotel integration (example)
        exotel_sid    = os.getenv("EXOTEL_SID", "")
        exotel_token  = os.getenv("EXOTEL_TOKEN", "")
        exotel_app    = os.getenv("EXOTEL_APP_ID", "")
        callback_url  = os.getenv("VOICE_CALLBACK_URL", "http://localhost:8004/call/dtmf-webhook")

        if not exotel_sid:
            logger.warning("Exotel credentials not set — call not initiated")
            return {"status": "skipped"}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"https://api.exotel.com/v1/Accounts/{exotel_sid}/Calls/connect.json",
                    auth=(exotel_sid, exotel_token),
                    data={
                        "From":      phone,
                        "CallerId":  os.getenv("EXOTEL_CALLER_ID", ""),
                        "Url":       f"http://my.exotel.com/{exotel_sid}/exoml/start/{exotel_app}",
                        "StatusCallback": callback_url,
                        "CustomField": session_id,
                    }
                )
                return resp.json()
        except Exception as e:
            logger.error(f"Call initiation error: {e}")
            return {"status": "error", "error": str(e)}


def _get_demo_audio_url(language: str) -> str:
    """Return a pre-recorded demo audio placeholder per language."""
    # In a real demo: host pre-recorded .wav files on S3/GCS
    base = os.getenv("DEMO_AUDIO_BASE_URL", "http://localhost:8004/static")
    return f"{base}/demo_{language}.wav"
