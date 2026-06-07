import os
import json
import boto3
import random
import string
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_frontend():
    logger.info("Setting up S3 and CloudFront for RakSetu Frontend...")
    region = os.getenv("AWS_REGION", "us-east-1")
    s3 = boto3.client('s3', region_name=region)
    cloudfront = boto3.client('cloudfront', region_name=region)
    
    # Generate unique bucket name
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    bucket_name = f"raksetu-frontend-{suffix}"
    
    try:
        # 1. Create S3 Bucket
        if region == "us-east-1":
            s3.create_bucket(Bucket=bucket_name)
        else:
            s3.create_bucket(Bucket=bucket_name, CreateBucketConfiguration={'LocationConstraint': region})
        logger.info(f"✅ Created S3 Bucket: {bucket_name}")
        
        # 2. Disable Block Public Access
        s3.put_public_access_block(
            Bucket=bucket_name,
            PublicAccessBlockConfiguration={
                'BlockPublicAcls': False,
                'IgnorePublicAcls': False,
                'BlockPublicPolicy': False,
                'RestrictPublicBuckets': False
            }
        )
        
        # 3. Add Bucket Policy for public read
        bucket_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket_name}/*"]
                }
            ]
        }
        s3.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(bucket_policy))
        logger.info("✅ Applied public read Bucket Policy")
        
        # 4. Enable Static Website Hosting
        s3.put_bucket_website(
            Bucket=bucket_name,
            WebsiteConfiguration={
                'ErrorDocument': {'Key': 'index.html'}, # For SPA fallback
                'IndexDocument': {'Suffix': 'index.html'}
            }
        )
        s3_endpoint = f"{bucket_name}.s3-website-{region}.amazonaws.com"
        logger.info(f"✅ Enabled Static Website Hosting. S3 Endpoint: http://{s3_endpoint}")
        
        # 5. Create CloudFront Distribution
        logger.info("Creating CloudFront Distribution (This may take ~5 minutes)...")
        cf_response = cloudfront.create_distribution(
            DistributionConfig={
                'CallerReference': f"raksetu-{suffix}",
                'Origins': {
                    'Quantity': 1,
                    'Items': [
                        {
                            'Id': f"S3-{bucket_name}",
                            'DomainName': s3_endpoint,
                            'CustomOriginConfig': {
                                'HTTPPort': 80,
                                'HTTPSPort': 443,
                                'OriginProtocolPolicy': 'http-only'
                            }
                        }
                    ]
                },
                'DefaultCacheBehavior': {
                    'TargetOriginId': f"S3-{bucket_name}",
                    'ViewerProtocolPolicy': 'redirect-to-https',
                    'MinTTL': 0,
                    'DefaultTTL': 3600,
                    'MaxTTL': 86400,
                    'ForwardedValues': {
                        'QueryString': False,
                        'Cookies': {'Forward': 'none'}
                    }
                },
                'Comment': 'RakSetu Frontend CDN',
                'Enabled': True,
                'DefaultRootObject': 'index.html'
            }
        )
        cf_domain = cf_response['Distribution']['DomainName']
        logger.info(f"✅ CloudFront Distribution created: https://{cf_domain}")
        
        print("\n" + "="*50)
        print("Frontend Hosting Setup Complete!")
        print(f"S3 Bucket: {bucket_name}")
        print(f"CloudFront URL: https://{cf_domain}")
        print("\nTo deploy your React app, run from the frontend directory:")
        print("npm run build")
        print(f"aws s3 sync dist/ s3://{bucket_name}")
        print("="*50 + "\n")
        
    except Exception as e:
        logger.error(f"❌ Failed to setup hosting: {e}")

if __name__ == "__main__":
    setup_frontend()
