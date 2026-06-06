import boto3
import uuid
import logging
import os
from botocore.exceptions import ClientError

logger = logging.getLogger("lex-client")

class LexClient:
    def __init__(self):
        self.client = boto3.client('lexv2-runtime', region_name=os.getenv("AWS_REGION", "us-east-1"))
        self.bot_id = os.getenv("LEX_BOT_ID")
        self.bot_alias_id = os.getenv("LEX_BOT_ALIAS_ID")
        self.locale_id = "en_IN"
        
        if not self.bot_id or not self.bot_alias_id:
            logger.warning("LEX_BOT_ID or LEX_BOT_ALIAS_ID not set! Lex client will mock responses in DEMO_MODE.")

    async def recognize_intent(self, text: str, session_id: str) -> str:
        """
        Sends text to Amazon Lex V2 and returns the matched intent name.
        """
        if not self.bot_id or not self.bot_alias_id:
            return ""

        try:
            # Lex requires synchronous call. We could wrap in asyncio.to_thread in a high-perf environment.
            response = self.client.recognize_text(
                botId=self.bot_id,
                botAliasId=self.bot_alias_id,
                localeId=self.locale_id,
                sessionId=session_id,
                text=text
            )
            
            intent = response.get('sessionState', {}).get('intent', {})
            intent_name = intent.get('name', '')
            
            if intent_name == 'FallbackIntent':
                return ""
            return intent_name
            
        except ClientError as e:
            logger.error(f"Lex RecognizeText failed: {e}")
            return ""
