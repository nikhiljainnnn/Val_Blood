"""
RakSetu -- Deploy Step Functions State Machine
===============================================
Creates the donor outreach cascade state machine in AWS.
Run once before hackathon demo.

Prerequisites:
    aws configure  (with your hackathon credentials)
    pip install boto3

Usage:
    python infra/deploy_step_functions.py
    python infra/deploy_step_functions.py --update  # if already exists
"""
import argparse
import json
import os
import sys
from pathlib import Path

import boto3


def get_or_create_sfn_role(iam, account_id: str) -> str:
    """Create IAM role for Step Functions to invoke Lambda."""
    role_name = "raksetu-sfn-execution-role"
    trust = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "states.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["lambda:InvokeFunction"],
                "Resource": f"arn:aws:lambda:*:{account_id}:function:raksetu-*"
            },
            {
                "Effect": "Allow",
                "Action": ["dynamodb:PutItem"],
                "Resource": f"arn:aws:dynamodb:*:{account_id}:table/raksetu-*"
            },
            {
                "Effect": "Allow",
                "Action": ["logs:CreateLogGroup", "logs:CreateLogDelivery",
                           "logs:PutLogEvents", "logs:DescribeLogGroups"],
                "Resource": "*"
            }
        ]
    }
    try:
        role = iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust),
            Description="RakSetu Step Functions execution role",
        )
        iam.put_role_policy(
            RoleName=role_name,
            PolicyName="raksetu-sfn-policy",
            PolicyDocument=json.dumps(policy),
        )
        import time; time.sleep(10)  # IAM propagation delay
        print(f"  Created IAM role: {role_name}")
        return role["Role"]["Arn"]
    except iam.exceptions.EntityAlreadyExistsException:
        role = iam.get_role(RoleName=role_name)
        print(f"  Using existing IAM role: {role_name}")
        return role["Role"]["Arn"]


def ensure_dynamodb_table(dynamodb, region: str) -> None:
    """Create DynamoDB table for cascade event logging."""
    table_name = "raksetu-churn-events"
    try:
        dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {"AttributeName": "donor_id",  "KeyType": "HASH"},
                {"AttributeName": "timestamp", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "donor_id",  "AttributeType": "S"},
                {"AttributeName": "timestamp", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        print(f"  Created DynamoDB table: {table_name}")
    except dynamodb.exceptions.ResourceInUseException:
        print(f"  DynamoDB table already exists: {table_name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--update", action="store_true", help="Update existing state machine")
    parser.add_argument("--region", default="us-east-1")
    args = parser.parse_args()

    region     = args.region
    sts        = boto3.client("sts",           region_name=region)
    sfn        = boto3.client("stepfunctions", region_name=region)
    iam        = boto3.client("iam",           region_name=region)
    dynamodb   = boto3.client("dynamodb",      region_name=region)
    account_id = sts.get_caller_identity()["Account"]

    print(f"\nRakSetu -- Step Functions Deployment")
    print("=" * 45)
    print(f"Account : {account_id}")
    print(f"Region  : {region}\n")

    # Read state machine definition
    definition_path = Path(__file__).parent / "step_functions_cascade.json"
    definition = definition_path.read_text()
    # Replace placeholder account ID
    definition = definition.replace("ACCOUNT_ID", account_id)

    # Setup DynamoDB table for cascade logging
    ensure_dynamodb_table(dynamodb, region)

    # Get or create IAM role
    role_arn = get_or_create_sfn_role(iam, account_id)

    state_machine_name = "raksetu-donor-cascade"

    if args.update:
        # Find existing and update
        machines = sfn.list_state_machines()["stateMachines"]
        existing = next((m for m in machines if m["name"] == state_machine_name), None)
        if existing:
            sfn.update_state_machine(
                stateMachineArn=existing["stateMachineArn"],
                definition=definition,
                roleArn=role_arn,
            )
            print(f"  Updated: {existing['stateMachineArn']}")
            arn = existing["stateMachineArn"]
        else:
            print("  State machine not found — creating fresh")
            args.update = False

    if not args.update:
        resp = sfn.create_state_machine(
            name=state_machine_name,
            definition=definition,
            roleArn=role_arn,
            type="STANDARD",
        )
        arn = resp["stateMachineArn"]
        print(f"  Created: {arn}")

    print(f"\nState machine ARN: {arn}")
    print("\nAdd to .env:")
    print(f"  CASCADE_SFN_ARN={arn}")
    print("\nTest with:")
    print(f"  aws stepfunctions start-execution \\")
    print(f"    --state-machine-arn {arn} \\")
    print(f"    --input '{{\"donor_id\":\"test-001\",\"phone\":\"+919876543210\",\"language\":\"hi\",\"replied\":false,\"churn_risk\":0.8}}'")


if __name__ == "__main__":
    main()
