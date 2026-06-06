#!/usr/bin/env python3
"""
RakSetu — AWS Budget & Billing Protection
==========================================
Run this THE MOMENT you receive your $40 AWS credits.
Sets up a $30 billing alarm so you never accidentally overspend.

Usage:
    python setup_aws_budget.py --email your@email.com
    python setup_aws_budget.py --email your@email.com --budget 30
"""
import argparse
import json
import os
import sys
import boto3
from datetime import datetime


def create_billing_alarm(email: str, threshold: float, region: str = "us-east-1"):
    """Create a CloudWatch billing alarm + SNS topic for email alerts."""
    sns    = boto3.client("sns",        region_name="us-east-1")   # billing always us-east-1
    cw     = boto3.client("cloudwatch", region_name="us-east-1")

    # Create SNS topic
    print(f"  Creating SNS topic...")
    topic = sns.create_topic(Name="raksetu-billing-alerts")
    topic_arn = topic["TopicArn"]

    # Subscribe email
    print(f"  Subscribing {email} to alerts...")
    sns.subscribe(
        TopicArn=topic_arn,
        Protocol="email",
        Endpoint=email,
    )
    print(f"  ⚠ Check {email} and confirm the SNS subscription!")

    # Create CloudWatch alarm
    print(f"  Creating billing alarm at ${threshold:.0f}...")
    cw.put_metric_alarm(
        AlarmName=f"raksetu-billing-{threshold:.0f}usd",
        AlarmDescription=f"RakSetu hackathon budget alert — ${threshold:.0f} threshold",
        MetricName="EstimatedCharges",
        Namespace="AWS/Billing",
        Statistic="Maximum",
        Period=86400,           # check daily
        EvaluationPeriods=1,
        Threshold=threshold,
        ComparisonOperator="GreaterThanThreshold",
        Dimensions=[{"Name": "Currency", "Value": "USD"}],
        AlarmActions=[topic_arn],
        OKActions=[topic_arn],
        TreatMissingData="notBreaching",
    )
    print(f"  ✅ Alarm created: triggers at ${threshold:.0f}")
    return topic_arn


def create_aws_budget(email: str, limit: float):
    """Create an AWS Budget with email alert at 75% and 100% of limit."""
    budgets     = boto3.client("budgets", region_name="us-east-1")
    account_id  = boto3.client("sts").get_caller_identity()["Account"]

    budget_name = "raksetu-hackathon-budget"

    try:
        budgets.create_budget(
            AccountId=account_id,
            Budget={
                "BudgetName": budget_name,
                "BudgetType": "COST",
                "TimeUnit":   "MONTHLY",
                "BudgetLimit": {
                    "Amount": str(limit),
                    "Unit":   "USD",
                },
                "CostTypes": {
                    "IncludeTax":     True,
                    "IncludeSupport": True,
                    "IncludeCredit":  False,   # don't count credits as cost
                },
            },
            NotificationsWithSubscribers=[
                {
                    "Notification": {
                        "NotificationType":          "ACTUAL",
                        "ComparisonOperator":        "GREATER_THAN",
                        "Threshold":                 75.0,
                        "ThresholdType":             "PERCENTAGE",
                        "NotificationState":         "ALARM",
                    },
                    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
                },
                {
                    "Notification": {
                        "NotificationType":          "ACTUAL",
                        "ComparisonOperator":        "GREATER_THAN",
                        "Threshold":                 100.0,
                        "ThresholdType":             "PERCENTAGE",
                        "NotificationState":         "ALARM",
                    },
                    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
                },
                {
                    "Notification": {
                        "NotificationType":          "FORECASTED",
                        "ComparisonOperator":        "GREATER_THAN",
                        "Threshold":                 100.0,
                        "ThresholdType":             "PERCENTAGE",
                        "NotificationState":         "ALARM",
                    },
                    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
                },
            ],
        )
        print(f"  ✅ Budget created: ${limit:.0f}/month with 75%+100% alerts")
    except budgets.exceptions.DuplicateRecordException:
        print(f"  ℹ Budget '{budget_name}' already exists")


def show_current_spend():
    """Show how much you've spent so far."""
    try:
        ce = boto3.client("ce", region_name="us-east-1")
        now   = datetime.utcnow()
        start = now.strftime("%Y-%m-01")
        end   = now.strftime("%Y-%m-%d")

        result = ce.get_cost_and_usage(
            TimePeriod={"Start": start, "End": end},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
        )
        amount = float(result["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"])
        print(f"\n  💰 Current spend this month: ${amount:.4f}")
    except Exception as e:
        print(f"\n  ⚠ Could not fetch current spend: {e}")


def main():
    parser = argparse.ArgumentParser(description="RakSetu AWS budget setup")
    parser.add_argument("--email",  required=True, help="Email for billing alerts")
    parser.add_argument("--budget", type=float, default=30.0,
                        help="Alert threshold in USD (default: 30, leaving $10 buffer)")
    args = parser.parse_args()

    print("\n🩸 RakSetu AWS Budget Setup")
    print("=" * 50)
    print(f"  Total credits: $40.00")
    print(f"  Alert at:      ${args.budget:.0f}.00")
    print(f"  Buffer:        ${40 - args.budget:.0f}.00")
    print(f"  Alert email:   {args.email}")
    print()

    try:
        print("📢 Setting up CloudWatch billing alarm...")
        create_billing_alarm(args.email, args.budget)

        print("\n📊 Setting up AWS Budget...")
        create_aws_budget(args.email, args.budget)

        show_current_spend()

        print(f"\n{'=' * 50}")
        print("✅ Budget protection active")
        print(f"   You will receive an email alert when spend exceeds ${args.budget:.0f}")
        print("   IMPORTANT: Confirm the SNS subscription in your email inbox")
        print("=" * 50)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("   Make sure AWS credentials are configured: aws configure")
        sys.exit(1)


if __name__ == "__main__":
    main()
