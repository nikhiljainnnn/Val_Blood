import os
import time
import boto3
import random
import string
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_aurora():
    logger.info("Setting up Amazon Aurora Serverless v2 (PostgreSQL) for RakSetu...")
    region = os.getenv("AWS_REGION", "us-east-1")
    rds = boto3.client('rds', region_name=region)
    secretsmanager = boto3.client('secretsmanager', region_name=region)
    
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
    cluster_identifier = f"raksetu-aurora-cluster-{suffix}"
    db_name = "raksetu"
    master_username = "postgres"
    
    # Generate a strong master password
    master_password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
    
    try:
        # 1. Store the password in Secrets Manager
        secret_name = f"raksetu/db/password-{suffix}"
        secretsmanager.create_secret(
            Name=secret_name,
            Description="Master password for RakSetu Aurora database",
            SecretString=master_password
        )
        logger.info(f"✅ Created Secret in Secrets Manager: {secret_name}")
        
        # 2. Create the Aurora Serverless v2 Cluster
        logger.info(f"Creating Aurora Cluster: {cluster_identifier}...")
        response = rds.create_db_cluster(
            DBClusterIdentifier=cluster_identifier,
            Engine='aurora-postgresql',
            EngineVersion='15.3',
            MasterUsername=master_username,
            MasterUserPassword=master_password,
            DatabaseName=db_name,
            ServerlessV2ScalingConfiguration={
                'MinCapacity': 0.5,
                'MaxCapacity': 4.0
            },
            BackupRetentionPeriod=7,
            StorageEncrypted=True,
            DeletionProtection=False # Set to True for actual production
        )
        
        # Wait a moment before creating the instance to ensure cluster is registering
        time.sleep(5)
        
        # 3. Create a Writer Instance for the Serverless Cluster
        instance_identifier = f"{cluster_identifier}-instance-1"
        logger.info(f"Creating Aurora Serverless v2 Instance: {instance_identifier}...")
        rds.create_db_instance(
            DBInstanceIdentifier=instance_identifier,
            DBClusterIdentifier=cluster_identifier,
            DBInstanceClass='db.serverless',
            Engine='aurora-postgresql'
        )
        logger.info("✅ Triggered creation of Aurora Serverless Instance.")
        
        print("\n" + "="*50)
        print("Aurora Database Provisioning Initiated!")
        print("NOTE: Provisioning takes 10-15 minutes to complete.")
        print(f"Cluster ID: {cluster_identifier}")
        print(f"Database Name: {db_name}")
        print(f"Master Username: {master_username}")
        print(f"Master Password Secret: {secret_name}")
        print("\nNext Steps:")
        print("1. Go to the AWS RDS Console and wait for the cluster to become 'Available'.")
        print("2. Copy the 'Writer endpoint'.")
        print("3. Update your local .env DATABASE_URL to:")
        print(f"   postgresql+asyncpg://{master_username}:<password>@<writer-endpoint>:5432/{db_name}")
        print("="*50 + "\n")
        
    except Exception as e:
        logger.error(f"❌ Failed to setup Aurora: {e}")

if __name__ == "__main__":
    setup_aurora()
