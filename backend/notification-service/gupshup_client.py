"""
Gupshup API client for WhatsApp and SMS delivery.
"""
import os
import logging
import httpx

logger = logging.getLogger("gupshup-client")

GUPSHUP_API_KEY     = os.getenv("GUPSHUP_API_KEY", "")
GUPSHUP_SOURCE      = os.getenv("GUPSHUP_SOURCE_NUMBER", "917834811114")
GUPSHUP_APP_NAME    = os.getenv("GUPSHUP_APP_NAME", "BloodWarriors")
GUPSHUP_WA_ENDPOINT = "https://api.gupshup.io/sm/api/v1/msg"
GUPSHUP_SMS_ENDPOINT = "https://api.gupshup.io/sm/api/v1/msg"

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"


class GupshupClient:

    def __init__(self):
        self.api_key = GUPSHUP_API_KEY
        self.timeout = 10.0

    async def send_whatsapp(self, phone: str, message: str) -> dict:
        """Send a WhatsApp message via Gupshup."""
        if DEMO_MODE:
            logger.info(f"[DEMO] WhatsApp to {phone}: {message[:80]}...")
            return {"status": "demo_sent", "phone": phone}

        if not self.api_key:
            logger.warning("GUPSHUP_API_KEY not set — skipping WhatsApp send")
            return {"status": "skipped"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    GUPSHUP_WA_ENDPOINT,
                    data={
                        "channel":     "whatsapp",
                        "source":      GUPSHUP_SOURCE,
                        "destination": phone.replace("+", ""),
                        "message":     message,
                        "src.name":    GUPSHUP_APP_NAME,
                    },
                    headers={"apikey": self.api_key},
                )
                result = resp.json()
                logger.info(f"WhatsApp sent to {phone}: {result.get('status')}")
                return result
        except Exception as e:
            logger.error(f"WhatsApp send failed to {phone}: {e}")
            return {"status": "error", "error": str(e)}

    async def send_sms(self, phone: str, message: str) -> dict:
        """Send an SMS via Gupshup."""
        if DEMO_MODE:
            logger.info(f"[DEMO] SMS to {phone}: {message[:80]}...")
            return {"status": "demo_sent", "phone": phone}

        if not self.api_key:
            return {"status": "skipped"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    GUPSHUP_SMS_ENDPOINT,
                    data={
                        "channel":     "sms",
                        "source":      GUPSHUP_SOURCE,
                        "destination": phone.replace("+", ""),
                        "message":     message,
                        "src.name":    GUPSHUP_APP_NAME,
                    },
                    headers={"apikey": self.api_key},
                )
                result = resp.json()
                logger.info(f"SMS sent to {phone}: {result.get('status')}")
                return result
        except Exception as e:
            logger.error(f"SMS send failed to {phone}: {e}")
            return {"status": "error", "error": str(e)}
