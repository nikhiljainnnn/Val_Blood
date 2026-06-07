import boto3
import os
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_sqs():
    logger.info("Setting up Amazon SQS queue for RakSetu Notification Service (Celery)...")
    sqs = boto3.client('sqs', region_name=os.getenv("AWS_REGION", "us-east-1"))
    
    queue_name = "raksetu_notifications"
    
    try:
        response = sqs.create_queue(
            QueueName=queue_name,
            Attributes={
                'VisibilityTimeout': '300', # 5 minutes
                'MessageRetentionPeriod': '345600', # 4 days
            }
        )
        queue_url = response['QueueUrl']
        logger.info(f"✅ Successfully created/retrieved SQS Queue: {queue_name}")
        logger.info(f"Queue URL: {queue_url}")
        
        # Note: Celery with SQS requires the URL or queue name in broker.
        print("\n" + "="*50)
        print("SQS Setup Complete!")
        print("Celery will automatically find this queue by name 'raksetu_notifications' if AWS keys are set.")
        print("="*50 + "\n")
        
    except Exception as e:
        logger.error(f"❌ Failed to create SQS Queue: {e}")

def setup_eventbridge():
    logger.info("Setting up Amazon EventBridge API Destination for Daily Agent Cron...")
    events = boto3.client('events', region_name=os.getenv("AWS_REGION", "us-east-1"))
    
    try:
        # Create connection (dummy key for local API Gateway, or real if protected)
        conn_response = events.create_connection(
            Name='RakSetuAPIConnection',
            AuthorizationType='API_KEY',
            AuthParameters={
                'ApiKeyAuthParameters': {
                    'ApiKeyName': 'Authorization',
                    'ApiKeyValue': 'Bearer dummy-token-for-cron'
                }
            }
        )
        conn_arn = conn_response['ConnectionArn']
        
        # Create API Destination
        # Replace with the actual public IP/domain of the EC2 or API Gateway
        api_dest_response = events.create_api_destination(
            Name='RakSetuAgentCron',
            ConnectionArn=conn_arn,
            InvocationEndpoint='http://localhost:8000/api/v1/agent/scheduled',
            HttpMethod='POST',
            InvocationRateLimitPerSecond=1
        )
        dest_arn = api_dest_response['ApiDestinationArn']
        
        # Create rule (every day at 9 AM UTC)
        rule_response = events.put_rule(
            Name='RakSetuDailyScan',
            ScheduleExpression='cron(0 9 * * ? *)',
            State='ENABLED'
        )
        
        logger.info("✅ Successfully created EventBridge Cron for Daily Agent Scans!")
    except Exception as e:
        logger.error(f"❌ Failed to create EventBridge Rule: {e}")

if __name__ == "__main__":
    setup_sqs()
    setup_eventbridge()
