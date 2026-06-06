"""
Amazon Bedrock client for RakSetu story engine.
Replaces Gemini. Uses Nova Lite for multilingual story generation,
Nova Micro for simple/fallback text (cheapest at $0.035/M tokens).
"""
import os
import json
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("bedrock-client")

AWS_REGION    = os.getenv("AWS_REGION", "us-east-1")
DEMO_MODE     = os.getenv("DEMO_MODE", "false").lower() == "true"

# Model IDs on Amazon Bedrock
NOVA_MICRO = "amazon.nova-micro-v1:0"   # $0.035/M input — text only, cheapest
NOVA_LITE  = "amazon.nova-lite-v1:0"    # $0.060/M input — multilingual, multimodal

_client = None

def get_bedrock_client():
    global _client
    if _client is None:
        _client = boto3.client(
            service_name="bedrock-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
    return _client


async def generate_story(
    milestone: str,
    donation_number: int,
    language: str,
    use_lite: bool = True,
) -> str:
    """
    Generate a personalized donor impact story via Amazon Bedrock.
    use_lite=True → Nova Lite (better multilingual quality, costs 2x more)
    use_lite=False → Nova Micro (cheapest, English-focused)
    """
    if DEMO_MODE:
        return _fallback_story(donation_number, language)

    LANG_NAMES = {
        "hi": "Hindi (Devanagari script)",
        "ta": "Tamil (Tamil script)",
        "te": "Telugu (Telugu script)",
        "bn": "Bengali (Bengali script)",
        "en": "English",
        "mr": "Marathi (Devanagari script)",
    }
    lang_name = LANG_NAMES.get(language, "English")
    model_id  = NOVA_LITE if use_lite else NOVA_MICRO

    prompt = f"""You are writing a short, warm, personal message (2-3 sentences, under 60 words) \
for a voluntary blood donor. Rules:
- Write in {lang_name} using the correct script
- Do NOT reveal any identifying details about the patient
- Reference this real milestone: "{milestone}"
- Naturally mention that this is the donor's #{donation_number} donation
- Make it emotional and human, not generic or corporate
- Output ONLY the message, no preamble, no quotes

Write the message now:"""

    body = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 200,
        "inferenceConfig": {
            "temperature": 0.75,
            "topP": 0.9,
        },
    })

    try:
        client   = get_bedrock_client()
        response = client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        text   = result["output"]["message"]["content"][0]["text"].strip()

        if len(text) < 10:
            logger.warning("Bedrock returned very short story — using fallback")
            return _fallback_story(donation_number, language)

        logger.info(f"Bedrock story ({model_id}, {language}): {text[:60]}...")
        return text

    except ClientError as e:
        code = e.response["Error"]["Code"]
        logger.error(f"Bedrock ClientError [{code}]: {e}")
        if code == "AccessDeniedException":
            logger.error(
                "Model access not enabled. Go to AWS Console → Bedrock → Model access "
                "and enable 'Amazon Nova Lite' and 'Amazon Nova Micro'."
            )
        return _fallback_story(donation_number, language)

    except Exception as e:
        logger.error(f"Bedrock story generation failed: {e}")
        return _fallback_story(donation_number, language)


async def classify_intent(text: str, language: str = "en") -> dict:
    """
    Lightweight intent classifier using Nova Micro (cheapest).
    Used for parsing donor IVR/WhatsApp replies into structured intents.
    Returns: {intent: 'confirm'|'defer'|'unknown', confidence: 0-1}
    """
    if DEMO_MODE:
        return {"intent": "confirm", "confidence": 0.95}

    prompt = f"""Classify the intent of this blood donor message.
Message: "{text}"
Language hint: {language}

Output ONLY valid JSON with keys: intent (one of: confirm, defer, question, unknown) and confidence (0.0-1.0).
Example: {{"intent": "confirm", "confidence": 0.92}}"""

    body = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 60,
        "inferenceConfig": {"temperature": 0.1},
    })

    try:
        client   = get_bedrock_client()
        response = client.invoke_model(
            modelId=NOVA_MICRO,   # cheapest — simple classification task
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        raw    = result["output"]["message"]["content"][0]["text"].strip()
        # Strip markdown fences if present
        raw = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(raw)

    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        # Heuristic fallback
        confirm_words = ["yes","1","हाँ","ஆம்","అవును","হ্যাঁ","sure","ok","okay"]
        return {
            "intent": "confirm" if any(w in text.lower() for w in confirm_words) else "unknown",
            "confidence": 0.6,
        }


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translate notification text between Indian languages using Nova Lite.
    Cost-conscious: only call when no pre-written template exists.
    """
    if DEMO_MODE or source_lang == target_lang:
        return text

    LANG_NAMES = {"hi":"Hindi","ta":"Tamil","te":"Telugu","bn":"Bengali","en":"English","mr":"Marathi"}
    src = LANG_NAMES.get(source_lang, "English")
    tgt = LANG_NAMES.get(target_lang, "Hindi")

    prompt = f"Translate this text from {src} to {tgt}. Output only the translation, nothing else:\n\n{text}"
    body   = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 300,
        "inferenceConfig": {"temperature": 0.1},
    })

    try:
        client   = get_bedrock_client()
        response = client.invoke_model(
            modelId=NOVA_LITE,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["output"]["message"]["content"][0]["text"].strip()
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return text


FALLBACK_STORIES = {
    "hi": "आपका {n}वाँ donation किसी बच्चे के जीवन की डोर थी। Blood Warriors और वो परिवार आपका शुक्रिया अदा करते हैं।",
    "ta": "உங்கள் {n}வது donation ஒரு குழந்தையின் உயிரை காப்பாற்றியது. Blood Warriors உங்களுக்கு நன்றி சொல்கிறது.",
    "te": "మీ {n}వ donation ఒక పిల్లవాడి జీవితాన్ని కాపాడింది. Blood Warriors మీకు కృతజ్ఞులు.",
    "bn": "আপনার {n}তম donation একটি শিশুর জীবন রক্ষা করেছে। Blood Warriors আপনার প্রতি কৃতজ্ঞ।",
    "en": "Your donation #{n} was a lifeline for a child who needed it most. Thank you from Blood Warriors and their family.",
    "mr": "तुमचं {n}वं donation एका मुलाचं जीवन वाचवलं. Blood Warriors तुमचे आभारी आहे.",
}

def _fallback_story(n: int, lang: str) -> str:
    tmpl = FALLBACK_STORIES.get(lang, FALLBACK_STORIES["en"])
    return tmpl.format(n=n)
