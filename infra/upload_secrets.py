import os
import boto3
import logging
from dotenv import dotenv_values

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def upload_secrets(env_path="backend/.env", prefix="/raksetu/prod/"):
    logger.info(f"Reading secrets from {env_path} and uploading to AWS SSM Parameter Store under {prefix}...")
    
    if not os.path.exists(env_path):
        logger.error(f"❌ File {env_path} not found!")
        return

    ssm = boto3.client('ssm', region_name=os.getenv("AWS_REGION", "us-east-1"))
    env_vars = dotenv_values(env_path)
    
    for key, value in env_vars.items():
        if not value:
            continue
            
        param_name = f"{prefix}{key}"
        try:
            # Use SecureString for encrypted at rest
            ssm.put_parameter(
                Name=param_name,
                Description=f"RakSetu config for {key}",
                Value=value,
                Type='SecureString',
                Overwrite=True
            )
            logger.info(f"✅ Uploaded: {param_name}")
        except Exception as e:
            logger.error(f"❌ Failed to upload {param_name}: {e}")

if __name__ == "__main__":
    upload_secrets()
