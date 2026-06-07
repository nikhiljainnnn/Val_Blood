"""
Amazon SNS API client for SMS delivery.
"""
import os
import logging
import asyncio
from functools import partial
import boto3

logger = logging.getLogger("sns-client")

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DEMO_MODE  = os.getenv("DEMO_MODE", "false").lower() == "true"

_sns_client = None

def get_sns_client():
    global _sns_client
    if _sns_client is None:
        _sns_client = boto3.client(
            "sns",
            region_name=AWS_REGION,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
    return _sns_client

class SNSClient:
    async def send_sms(self, phone: str, message: str) -> dict:
        """Send an SMS via Amazon SNS asynchronously."""
        if DEMO_MODE:
            logger.info(f"[DEMO SNS] SMS to {phone}: {message[:80]}...")
            return {"status": "demo_sent", "phone": phone}

        try:
            client = get_sns_client()
            loop = asyncio.get_running_loop()
            
            # Format phone number for AWS (E.164 format)
            # Make sure it has a leading '+'
            formatted_phone = phone if phone.startswith("+") else f"+{phone}"
            
            func = partial(
                client.publish,
                PhoneNumber=formatted_phone,
                Message=message,
            )
            
            # Run the synchronous boto3 publish call in an executor thread
            response = await loop.run_in_executor(None, func)
            
            logger.info(f"SNS SMS sent to {phone}. MessageId: {response.get('MessageId')}")
            return {"status": "success", "message_id": response.get('MessageId')}
            
        except Exception as e:
            logger.error(f"SNS SMS send failed to {phone}: {e}")
            return {"status": "error", "error": str(e)}
