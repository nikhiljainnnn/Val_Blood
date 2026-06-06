"""
RakSetu -- SQS Queue Setup
============================
Creates:
  1. raksetu-cascade-dlq  -- Dead letter queue (failed cascade attempts)
  2. raksetu-cascade-queue -- Main cascade trigger queue
  3. EventBridge rule -> SQS (transfusion triggers)
  4. Lambda trigger: SQS -> Step Functions

This makes SQS the async buffer between events and the Step Functions cascade,
exactly as shown in the architecture (Events layer: SQS = "Async task queues").

Usage:
    python infra/setup_sqs.py
    python infra/setup_sqs.py --sfn-arn <ARN>  # wire to existing state machine
"""
import argparse
import json
import os
import zipfile
from io import BytesIO

import boto3

# Lambda that reads from SQS and starts Step Functions execution
SQS_TO_SFN_CODE = '''
import boto3, json, os
from datetime import datetime

sfn = boto3.client("stepfunctions")
SFN_ARN = os.environ.get("CASCADE_SFN_ARN", "")

def handler(event, context):
    results = []
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            donor_id = body.get("donor_id", "unknown")

            if not SFN_ARN:
                print(f"No SFN_ARN set, skipping cascade for {donor_id}")
                results.append({"donor_id": donor_id, "status": "skipped_no_arn"})
                continue

            exec_name = f"cascade-{donor_id[:20]}-{int(datetime.utcnow().timestamp())}"
            sfn.start_execution(
                stateMachineArn=SFN_ARN,
                name=exec_name,
                input=json.dumps({
                    "donor_id":   donor_id,
                    "phone":      body.get("phone", ""),
                    "language":   body.get("language", "hi"),
                    "replied":    False,
                    "churn_risk": body.get("churn_risk", 0.8),
                    "blood_group": body.get("blood_group", ""),
                    "trigger_reason": body.get("trigger_reason", "Not donated in last 1 year"),
                }),
            )
            print(f"Started cascade: {exec_name}")
            results.append({"donor_id": donor_id, "status": "cascade_started"})

        except Exception as e:
            print(f"ERROR processing record: {e}")
            results.append({"error": str(e)})

    return {"processed": len(results), "results": results}
'''


def create_lambda_zip() -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.py", SQS_TO_SFN_CODE)
    return buf.getvalue()


def get_or_create_lambda_role(iam, account_id: str) -> str:
    """Reuse or create the raksetu-lambda-execution-role."""
    role_name = "raksetu-lambda-execution-role"
    try:
        role = iam.get_role(RoleName=role_name)
        print(f"  Using existing IAM role: {role_name}")
        return role["Role"]["Arn"]
    except iam.exceptions.NoSuchEntityException:
        pass

    trust = {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow",
                       "Principal": {"Service": "lambda.amazonaws.com"},
                       "Action": "sts:AssumeRole"}]
    }
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Action": ["logs:*"], "Resource": "*"},
            {"Effect": "Allow", "Action": ["states:StartExecution"],
             "Resource": f"arn:aws:states:*:{account_id}:stateMachine:raksetu-*"},
            {"Effect": "Allow",
             "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
             "Resource": f"arn:aws:sqs:*:{account_id}:raksetu-*"},
        ]
    }
    role = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(trust),
    )
    iam.put_role_policy(
        RoleName=role_name,
        PolicyName="raksetu-lambda-policy",
        PolicyDocument=json.dumps(policy),
    )
    import time; time.sleep(12)  # IAM propagation
    print(f"  Created IAM role: {role_name}")
    return role["Role"]["Arn"]


def main():
    parser = argparse.ArgumentParser(description="Setup SQS queues for RakSetu cascade")
    parser.add_argument("--sfn-arn", default=os.getenv("CASCADE_SFN_ARN", ""))
    parser.add_argument("--region",  default="us-east-1")
    args = parser.parse_args()

    region     = args.region
    sqs        = boto3.client("sqs",        region_name=region)
    lmb        = boto3.client("lambda",     region_name=region)
    events     = boto3.client("events",     region_name=region)
    iam        = boto3.client("iam",        region_name=region)
    sts        = boto3.client("sts",        region_name=region)
    account_id = sts.get_caller_identity()["Account"]

    print(f"\nRakSetu -- SQS Queue Setup")
    print("=" * 45)
    print(f"Account : {account_id}  |  Region: {region}")
    print(f"SFN ARN : {args.sfn_arn or '(not set -- cascade will log only)'}\n")

    # ── 1. Dead Letter Queue ─────────────────────────────────────────────────
    print("Creating Dead Letter Queue...")
    dlq = sqs.create_queue(
        QueueName="raksetu-cascade-dlq",
        Attributes={"MessageRetentionPeriod": "1209600"}  # 14 days
    )
    dlq_url = dlq["QueueUrl"]
    dlq_arn = sqs.get_queue_attributes(
        QueueUrl=dlq_url, AttributeNames=["QueueArn"]
    )["Attributes"]["QueueArn"]
    print(f"  DLQ ARN : {dlq_arn}")

    # ── 2. Main Cascade Queue ────────────────────────────────────────────────
    print("Creating Main Cascade Queue...")
    q = sqs.create_queue(
        QueueName="raksetu-cascade-queue",
        Attributes={
            "VisibilityTimeout":      "300",   # 5 min (Step Functions startup time)
            "MessageRetentionPeriod": "86400", # 24 hours
            "ReceiveMessageWaitTimeSeconds": "20",  # long polling
            "RedrivePolicy": json.dumps({
                "deadLetterTargetArn": dlq_arn,
                "maxReceiveCount":     "3",    # 3 attempts before DLQ
            }),
        }
    )
    q_url = q["QueueUrl"]
    q_arn = sqs.get_queue_attributes(
        QueueUrl=q_url, AttributeNames=["QueueArn"]
    )["Attributes"]["QueueArn"]
    print(f"  Queue ARN: {q_arn}")
    print(f"  Queue URL: {q_url}")

    # ── 3. Grant EventBridge permission to send to SQS ───────────────────────
    print("Setting SQS policy for EventBridge...")
    sqs_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Sid":    "AllowEventBridge",
            "Effect": "Allow",
            "Principal": {"Service": "events.amazonaws.com"},
            "Action":    "sqs:SendMessage",
            "Resource":  q_arn,
        }]
    }
    sqs.set_queue_attributes(
        QueueUrl=q_url,
        Attributes={"Policy": json.dumps(sqs_policy)}
    )

    # ── 4. SQS -> Lambda -> Step Functions ──────────────────────────────────
    print("Deploying SQS->Lambda trigger...")
    role_arn = get_or_create_lambda_role(iam, account_id)
    fn_name  = "raksetu-sqs-to-sfn"
    code     = create_lambda_zip()
    env      = {"CASCADE_SFN_ARN": args.sfn_arn}

    try:
        lmb.create_function(
            FunctionName=fn_name,
            Runtime="python3.11",
            Role=role_arn,
            Handler="index.handler",
            Code={"ZipFile": code},
            Timeout=120,
            MemorySize=256,
            Environment={"Variables": env},
            Description="RakSetu: reads cascade requests from SQS, starts Step Functions",
        )
        print(f"  Created Lambda: {fn_name}")
    except lmb.exceptions.ResourceConflictException:
        lmb.update_function_code(FunctionName=fn_name, ZipFile=code)
        lmb.update_function_configuration(
            FunctionName=fn_name, Environment={"Variables": env}
        )
        print(f"  Updated Lambda: {fn_name}")

    fn_arn = lmb.get_function(FunctionName=fn_name)["Configuration"]["FunctionArn"]

    # Attach SQS event source mapping
    try:
        lmb.create_event_source_mapping(
            EventSourceArn=q_arn,
            FunctionName=fn_name,
            BatchSize=5,
            Enabled=True,
        )
        print(f"  SQS -> Lambda event source mapping created")
    except lmb.exceptions.ResourceConflictException:
        print(f"  SQS event source mapping already exists")

    # ── 5. EventBridge rule -> SQS (transfusion triggers) ───────────────────
    print("Creating EventBridge rule -> SQS...")
    rule_name = "raksetu-transfusion-trigger"
    rule_arn  = events.put_rule(
        Name=rule_name,
        ScheduleExpression="rate(6 hours)",
        State="ENABLED",
        Description="Triggers cascade via SQS for at-risk donors every 6h",
    )["RuleArn"]

    events.put_targets(
        Rule=rule_name,
        Targets=[{
            "Id":  "cascade-queue",
            "Arn": q_arn,
            "Input": json.dumps({
                "source":   "eventbridge-schedule",
                "trigger":  "transfusion-window",
                "batch":    True,
            }),
        }]
    )
    print(f"  EventBridge rule: {rule_name} -> SQS")

    # ── Done ─────────────────────────────────────────────────────────────────
    print(f"\nSQS Setup Complete!")
    print(f"\nAdd to .env:")
    print(f"  CASCADE_QUEUE_URL={q_url}")
    print(f"  CASCADE_DLQ_URL={dlq_url}")
    print(f"\nFlow: EventBridge (6h) -> SQS -> Lambda -> Step Functions -> WhatsApp/SMS/Voice")


if __name__ == "__main__":
    main()
