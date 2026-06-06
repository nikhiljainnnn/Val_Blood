import boto3
import time
import json
from botocore.exceptions import ClientError
import os
from dotenv import load_dotenv

load_dotenv()

def create_lex_bot():
    iam = boto3.client('iam')
    lex = boto3.client('lexv2-models')
    sts = boto3.client('sts')

    account_id = sts.get_caller_identity()["Account"]
    role_name = 'RakSetuLexBotRole'
    
    # 1. Create IAM Role for Lex
    print("Creating IAM Role...")
    try:
        role_response = iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps({
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "lexv2.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            })
        )
        role_arn = role_response['Role']['Arn']
        print(f"Role created: {role_arn}")
        time.sleep(10)  # Wait for role to propagate
    except ClientError as e:
        if e.response['Error']['Code'] == 'EntityAlreadyExists':
            role_arn = iam.get_role(RoleName=role_name)['Role']['Arn']
            print(f"Role already exists: {role_arn}")
        else:
            raise

    # 2. Create Lex Bot
    bot_name = 'DonorConfirmationBot'
    print(f"Creating Lex Bot: {bot_name}...")
    try:
        bot_response = lex.create_bot(
            botName=bot_name,
            description='RakSetu Donor Confirmation IVR',
            roleArn=role_arn,
            dataPrivacy={'childDirected': False},
            idleSessionTTLInSeconds=300
        )
        bot_id = bot_response['botId']
        print(f"Bot created with ID: {bot_id}")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConflictException':
            print("Bot already exists, fetching ID...")
            bots = lex.list_bots()['botSummaries']
            bot_id = next(b['botId'] for b in bots if b['botName'] == bot_name)
        else:
            raise

    # Wait for bot to be available
    while True:
        status = lex.describe_bot(botId=bot_id)['botStatus']
        if status == 'Available':
            break
        print(f"Waiting for bot status: {status}")
        time.sleep(2)

    # 3. Create Bot Locale (hi_IN and en_IN)
    print("Creating Bot Locale en_IN...")
    try:
        lex.create_bot_locale(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_IN',
            description='Indian English',
            nluIntentConfidenceThreshold=0.40,
            voiceSettings={'voiceId': 'Aditi'}
        )
    except ClientError as e:
        if e.response['Error']['Code'] != 'ConflictException':
            raise

    while True:
        status = lex.describe_bot_locale(botId=bot_id, botVersion='DRAFT', localeId='en_IN')['botLocaleStatus']
        if status in ['Built', 'NotBuilt', 'ReadyExpressive']:
            break
        print(f"Waiting for locale status: {status}")
        time.sleep(2)

    # 4. Create Intents
    print("Creating ConfirmIntent...")
    try:
        confirm_intent = lex.create_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_IN',
            intentName='ConfirmIntent',
            sampleUtterances=[
                {'utterance': 'yes'}, {'utterance': 'i can donate'}, 
                {'utterance': 'sure'}, {'utterance': 'okay'},
                {'utterance': 'haan'}, {'utterance': 'ji'},
                {'utterance': 'haan mai kar sakta hu'}
            ]
        )
    except ClientError as e:
        pass

    print("Creating DenyIntent...")
    try:
        deny_intent = lex.create_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_IN',
            intentName='DenyIntent',
            sampleUtterances=[
                {'utterance': 'no'}, {'utterance': 'i cannot donate'}, 
                {'utterance': 'not possible'}, {'utterance': 'nahi'},
                {'utterance': 'abhi nahi'}
            ]
        )
    except ClientError as e:
        pass

    # 5. Build Bot
    print("Building Bot...")
    lex.build_bot_locale(botId=bot_id, botVersion='DRAFT', localeId='en_IN')
    while True:
        status = lex.describe_bot_locale(botId=bot_id, botVersion='DRAFT', localeId='en_IN')['botLocaleStatus']
        if status == 'Built':
            break
        elif status == 'Failed':
            raise Exception("Bot build failed")
        print("Building...")
        time.sleep(5)

    # 6. Create Alias
    print("Creating Bot Alias...")
    alias_name = 'ProdAlias'
    try:
        alias_response = lex.create_bot_alias(
            botAliasName=alias_name,
            botId=bot_id,
            botVersion='DRAFT'
        )
        alias_id = alias_response['botAliasId']
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConflictException':
            aliases = lex.list_bot_aliases(botId=bot_id)['botAliasSummaries']
            alias_id = next(a['botAliasId'] for a in aliases if a['botAliasName'] == alias_name)
        else:
            raise

    print("\n" + "="*50)
    print("Lex Bot Setup Complete!")
    print(f"LEX_BOT_ID={bot_id}")
    print(f"LEX_BOT_ALIAS_ID={alias_id}")
    print("="*50)

    # Automatically append to .env
    env_path = ".env"
    if os.path.exists(env_path):
        with open(env_path, "a") as f:
            f.write(f"\nLEX_BOT_ID={bot_id}\n")
            f.write(f"LEX_BOT_ALIAS_ID={alias_id}\n")
        print(f"Added LEX_BOT_ID and LEX_BOT_ALIAS_ID to {env_path}")

if __name__ == "__main__":
    create_lex_bot()
