"""Quick check: are Nova Lite + Nova Micro accessible in your AWS account?"""
import boto3
import os

# Load credentials from environment variables only (never hardcode keys here!)
# Set these in your shell or .env before running:
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
AWS_ACCESS_KEY_ID     = os.getenv("AWS_ACCESS_KEY_ID",     "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION            = os.getenv("AWS_REGION",             "us-east-1")

TARGET_MODELS = [
    "amazon.nova-lite-v1:0",
    "amazon.nova-micro-v1:0",
]

print(f"Checking Bedrock in region: {AWS_REGION}")
print(f"Using key: {AWS_ACCESS_KEY_ID[:8]}...")

try:
    bedrock = boto3.client(
        "bedrock",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )

    # List accessible models
    resp   = bedrock.list_foundation_models(byOutputModality="TEXT")
    models = {m["modelId"]: m for m in resp["modelSummaries"]}

    print("\n=== Target model status ===")
    all_ok = True
    for model_id in TARGET_MODELS:
        if model_id in models:
            status = models[model_id].get("modelLifecycle", {}).get("status", "unknown")
            print(f"  ✅  {model_id}  —  {status}")
        else:
            print(f"  ❌  {model_id}  —  NOT FOUND / NOT ENABLED")
            all_ok = False

    # Quick invoke test on Nova Micro (cheapest)
    print("\n=== Live invoke test (Nova Micro) ===")
    rt = boto3.client(
        "bedrock-runtime",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )
    import json
    resp2 = rt.invoke_model(
        modelId="amazon.nova-micro-v1:0",
        body=json.dumps({
            "messages": [{"role": "user", "content": "Reply with exactly: RAKSETU_OK"}],
            "max_tokens": 20,
            "inferenceConfig": {"temperature": 0.1},
        }),
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(resp2["body"].read())
    text   = result["output"]["message"]["content"][0]["text"].strip()
    print(f"  Model replied: {text}")
    print(f"\n{'✅  Bedrock is live — DEMO_MODE=false is ready!' if 'RAKSETU' in text or len(text) > 0 else '⚠️  Got empty response — check model access'}")

except Exception as e:
    print(f"\n❌  Error: {e}")
    print("\nAction needed:")
    print("  1. Go to AWS Console → Bedrock → Model access")
    print("  2. Enable: amazon.nova-lite-v1:0  and  amazon.nova-micro-v1:0")
    print("  3. Wait ~2 minutes then re-run this script")
