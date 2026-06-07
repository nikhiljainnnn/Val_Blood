import os
import logging

logger = logging.getLogger("ssm_loader")

def load_ssm_parameters(prefix="/raksetu/prod/"):
    """
    Fetch all parameters under a prefix from AWS SSM Parameter Store
    and inject them into os.environ.
    Only runs if USE_SSM=true in environment.
    """
    if os.getenv("USE_SSM", "false").lower() != "true":
        return

    logger.info(f"Loading configuration from AWS SSM Parameter Store under {prefix}...")
    
    try:
        import boto3
        ssm = boto3.client('ssm', region_name=os.getenv("AWS_REGION", "us-east-1"))
        
        paginator = ssm.get_paginator('get_parameters_by_path')
        response_iterator = paginator.paginate(
            Path=prefix,
            Recursive=True,
            WithDecryption=True
        )
        
        count = 0
        for page in response_iterator:
            for param in page['Parameters']:
                # Extract the key name from the path (e.g. /raksetu/prod/JWT_SECRET -> JWT_SECRET)
                key = param['Name'][len(prefix):]
                os.environ[key] = param['Value']
                count += 1
                
        logger.info(f"✅ Successfully loaded {count} parameters from SSM into environment.")
    except Exception as e:
        logger.error(f"❌ Failed to load SSM parameters: {e}")
        # We don't raise an exception here so the app can fallback to local .env if it wants
