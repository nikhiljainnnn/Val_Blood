"""
RakSetu -- Amazon Lex Bot Setup
=================================
Creates a multilingual donor IVR bot with 4 core intents.

Bot: RakSetuDonorBot
Locales: hi_IN (Hindi), en_IN (English)

Intents:
  1. ConfirmDonation   -- donor says yes/haan/confirm
  2. DeferDonation     -- donor says not now/baad mein/busy
  3. AskQuestion       -- donor asks about process/location
  4. RequestReschedule -- donor wants a different date/time

Usage:
    python infra/create_lex_bot.py
    python infra/create_lex_bot.py --rebuild  # delete and recreate
"""
import argparse
import json
import os
import time

import boto3


BOT_NAME    = "RakSetuDonorBot"
BOT_ALIAS   = "RakSetuLive"
REGION      = os.getenv("AWS_REGION", "us-east-1")


INTENTS = {
    "hi_IN": [
        {
            "name": "ConfirmDonation",
            "description": "Donor confirms they will donate blood",
            "sample_utterances": [
                "haan", "haan main donate karunga", "bilkul", "theek hai",
                "zaroor", "ok", "yes", "main taiyar hoon", "confirm",
                "1",  # IVR keypress
            ],
            "closing_response": "Bahut achha! Hum aapko appointment details bhejenge. Dhanyavaad!",
        },
        {
            "name": "DeferDonation",
            "description": "Donor cannot donate right now but may later",
            "sample_utterances": [
                "abhi nahi", "baad mein", "kal", "is hafte nahi",
                "busy hoon", "thoda time chahiye", "next month",
                "2",  # IVR keypress
            ],
            "closing_response": "Theek hai, hum agle hafte phir try karenge. Dhanyavaad!",
        },
        {
            "name": "AskQuestion",
            "description": "Donor asks about donation process or blood bank location",
            "sample_utterances": [
                "kahaan jaana hai", "kaise donate karna hai", "location kya hai",
                "kitna time lagega", "kya laana hai", "blood bank kahan hai",
                "3",  # IVR keypress
            ],
            "closing_response": "Main aapko sari jankari WhatsApp par bhej raha hoon.",
        },
        {
            "name": "RequestReschedule",
            "description": "Donor wants to reschedule to a different time",
            "sample_utterances": [
                "koi aur din", "alag time", "Sunday ko",
                "shaam ko", "subah ko", "kab aana hai badlo",
                "4",  # IVR keypress
            ],
            "closing_response": "Theek hai, coordinator se baat kar ke confirm karenge.",
        },
    ],
    "en_IN": [
        {
            "name": "ConfirmDonation",
            "description": "Donor confirms they will donate",
            "sample_utterances": [
                "yes", "sure", "ok", "I will donate", "confirm", "definitely",
                "I am ready", "count me in", "1",
            ],
            "closing_response": "Wonderful! We will send you the appointment details. Thank you!",
        },
        {
            "name": "DeferDonation",
            "description": "Donor cannot donate now",
            "sample_utterances": [
                "not now", "later", "next week", "I am busy", "maybe later",
                "not this week", "2",
            ],
            "closing_response": "No problem, we will check back with you next week. Thank you!",
        },
        {
            "name": "AskQuestion",
            "description": "Donor asks about the process",
            "sample_utterances": [
                "where do I go", "how does it work", "what do I need to bring",
                "where is the blood bank", "how long does it take", "3",
            ],
            "closing_response": "I will send you all the details on WhatsApp right away.",
        },
        {
            "name": "RequestReschedule",
            "description": "Donor wants to reschedule",
            "sample_utterances": [
                "different time", "another day", "Sunday", "evening",
                "morning", "can we change the time", "4",
            ],
            "closing_response": "Sure, our coordinator will call you to find a better time.",
        },
    ]
}


def get_or_create_lex_role(iam) -> str:
    """IAM role for Lex to call Lambda."""
    role_name = "raksetu-lex-role"
    trust = {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow",
                       "Principal": {"Service": "lexv2.amazonaws.com"},
                       "Action": "sts:AssumeRole"}]
    }
    try:
        role = iam.get_role(RoleName=role_name)
        print(f"  Using existing Lex role: {role_name}")
        return role["Role"]["Arn"]
    except iam.exceptions.NoSuchEntityException:
        pass
    role = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(trust),
    )
    iam.attach_role_policy(
        RoleName=role_name,
        PolicyArn="arn:aws:iam::aws:policy/AmazonLexFullAccess",
    )
    time.sleep(8)
    print(f"  Created Lex role: {role_name}")
    return role["Role"]["Arn"]


def create_bot(lex, role_arn: str) -> str:
    """Create the RakSetu donor IVR bot."""
    try:
        bots = lex.list_bots(filters=[{"name": "BotName", "values": [BOT_NAME],
                                        "operator": "EQ"}])
        existing = bots.get("botSummaries", [])
        if existing:
            bot_id = existing[0]["botId"]
            print(f"  Bot already exists: {BOT_NAME} ({bot_id})")
            return bot_id
    except Exception:
        pass

    resp = lex.create_bot(
        botName=BOT_NAME,
        description="RakSetu donor IVR bot — confirms/defers blood donations in Hindi and English",
        roleArn=role_arn,
        dataPrivacy={"childDirected": False},
        idleSessionTTLInSeconds=300,
    )
    bot_id = resp["botId"]
    print(f"  Created bot: {BOT_NAME} ({bot_id})")
    return bot_id


def wait_for_bot(lex, bot_id: str, version: str = "DRAFT"):
    """Poll until bot is Available."""
    for _ in range(30):
        resp   = lex.describe_bot(botId=bot_id)
        status = resp["botStatus"]
        if status == "Available":
            return
        if status in ("Failed", "Deleting"):
            raise RuntimeError(f"Bot entered {status} state")
        time.sleep(5)
    raise TimeoutError("Bot did not become Available in time")


def create_locale_and_intents(lex, bot_id: str, locale_id: str, intents: list):
    """Create locale with all intents."""
    # Create or update locale
    try:
        lex.create_bot_locale(
            botId=bot_id,
            botVersion="DRAFT",
            localeId=locale_id,
            nluIntentConfidenceThreshold=0.40,
            voiceSettings={"voiceId": "Aditi" if locale_id == "hi_IN" else "Raveena",
                           "engine": "standard"},
        )
        print(f"  Created locale: {locale_id}")
        time.sleep(15)
    except Exception as e:
        if "exists" in str(e).lower() or "creating state" in str(e).lower():
            print(f"  Locale already exists or is creating: {locale_id}")
        else:
            print(f"  Locale error: {e}")

    # Create each intent
    for intent_cfg in intents:
        utterances = [{"utterance": u} for u in intent_cfg["sample_utterances"]]
        try:
            lex.create_intent(
                intentName=intent_cfg["name"],
                description=intent_cfg["description"],
                sampleUtterances=utterances,
                botId=bot_id,
                botVersion="DRAFT",
                localeId=locale_id,
                intentClosingSetting={
                    "closingResponse": {
                        "messageGroups": [{
                            "message": {
                                "plainTextMessage": {
                                    "value": intent_cfg["closing_response"]
                                }
                            }
                        }]
                    },
                    "active": True,
                }
            )
            print(f"    Intent created: {intent_cfg['name']} ({locale_id})")
        except lex.exceptions.ConflictException:
            print(f"    Intent exists: {intent_cfg['name']} ({locale_id})")
        except Exception as e:
            print(f"    Intent error ({intent_cfg['name']}): {e}")


def build_and_alias(lex, bot_id: str) -> str:
    """Build bot and create live alias."""
    print("  Building bot (this takes ~30s)...")
    lex.build_bot_locale(botId=bot_id, botVersion="DRAFT", localeId="hi_IN")
    lex.build_bot_locale(botId=bot_id, botVersion="DRAFT", localeId="en_IN")
    time.sleep(30)

    # Create version
    try:
        ver_resp = lex.create_bot_version(
            botId=bot_id,
            botVersionLocaleSpecification={
                "hi_IN": {"sourceBotVersion": "DRAFT"},
                "en_IN": {"sourceBotVersion": "DRAFT"},
            }
        )
        version = ver_resp["botVersion"]
        print(f"  Bot version created: {version}")
        time.sleep(10)
    except Exception as e:
        print(f"  Version creation issue (may need manual trigger): {e}")
        version = "DRAFT"

    # Create or update alias
    try:
        alias = lex.create_bot_alias(
            botAliasName=BOT_ALIAS,
            botId=bot_id,
            botVersion=version,
            botAliasLocaleSettings={
                "hi_IN": {"enabled": True},
                "en_IN": {"enabled": True},
            }
        )
        alias_id = alias["botAliasId"]
    except Exception as e:
        if "exists" in str(e).lower() or "creating state" in str(e).lower():
            pass
        else:
            print(f"  Alias error: {e}")
        aliases  = lex.list_bot_aliases(botId=bot_id)
        alias_id = next(
            (a["botAliasId"] for a in aliases["botAliasSummaries"] if a["botAliasName"] == BOT_ALIAS),
            "TSTALIASID"
        )

    print(f"  Alias: {BOT_ALIAS} ({alias_id})")
    return alias_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild", action="store_true", help="Delete existing bot and recreate")
    parser.add_argument("--region",  default=REGION)
    args = parser.parse_args()

    lex = boto3.client("lexv2-models", region_name=args.region)
    iam = boto3.client("iam",          region_name=args.region)

    print(f"\nRakSetu -- Amazon Lex Bot Setup")
    print("=" * 45)
    print(f"Bot: {BOT_NAME}  |  Locales: hi_IN, en_IN\n")

    role_arn = get_or_create_lex_role(iam)
    bot_id   = create_bot(lex, role_arn)

    wait_for_bot(lex, bot_id)

    for locale_id, intents in INTENTS.items():
        print(f"\nSetting up locale: {locale_id}")
        create_locale_and_intents(lex, bot_id, locale_id, intents)

    alias_id = build_and_alias(lex, bot_id)

    print(f"\nLex Bot Ready!")
    print(f"\nAdd to .env:")
    print(f"  LEX_BOT_ID={bot_id}")
    print(f"  LEX_BOT_ALIAS_ID={alias_id}")
    print(f"  LEX_LOCALE_HI=hi_IN")
    print(f"  LEX_LOCALE_EN=en_IN")
    print(f"\nTest with:")
    print(f"  aws lexv2-runtime recognize-text \\")
    print(f"    --bot-id {bot_id} --bot-alias-id {alias_id} \\")
    print(f"    --locale-id hi_IN --session-id test-001 \\")
    print(f"    --text 'haan main donate karunga'")


if __name__ == "__main__":
    main()
