import os
import mimetypes
import boto3
from dotenv import load_dotenv

load_dotenv()

s3 = boto3.client('s3', region_name=os.getenv("AWS_REGION", "us-east-1"))
BUCKET_NAME = "raksetu-frontend-ll2qqr"

def upload_folder_to_s3(local_dir, bucket_name):
    for root, dirs, files in os.walk(local_dir):
        for file in files:
            local_path = os.path.join(root, file)
            # Make path relative to local_dir
            s3_path = os.path.relpath(local_path, local_dir).replace('\\', '/')
            
            content_type, _ = mimetypes.guess_type(local_path)
            if not content_type:
                content_type = "application/octet-stream"
                
            print(f"Uploading {s3_path}...")
            s3.upload_file(
                local_path, 
                bucket_name, 
                s3_path,
                ExtraArgs={'ContentType': content_type}
            )

print("Starting S3 upload...")
upload_folder_to_s3("frontend/dist", BUCKET_NAME)
print("Upload complete!")
