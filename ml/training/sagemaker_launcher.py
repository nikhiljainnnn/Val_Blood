"""
RakSetu — SageMaker Training Launcher
======================================
Use this ONLY if the hackathon mandates SageMaker.
Otherwise use train_pipeline.py directly (faster, cheaper).

Usage:
    python sagemaker_launcher.py --data dataset.csv --role arn:aws:iam::XXXX:role/SageMakerRole
    python sagemaker_launcher.py --data dataset.csv --role auto  # auto-discovers execution role

Cost estimate:
    ml.m5.large spot instance: ~$0.006 per 30-minute job (90% spot discount)
    ml.m5.large on-demand:     ~$0.058 per 30-minute job
    Always use --spot unless the hackathon explicitly disallows it.
"""
import argparse
import os
import boto3
import sagemaker
from pathlib import Path


S3_BUCKET = os.getenv("S3_BUCKET", "raksetu-models")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def get_execution_role(role_arg: str) -> str:
    """Resolve IAM role ARN. 'auto' tries to get the current execution role."""
    if role_arg == "auto":
        try:
            return sagemaker.get_execution_role()
        except Exception:
            # Not running inside SageMaker — fall back to env var
            role = os.getenv("SAGEMAKER_ROLE_ARN", "")
            if not role:
                raise ValueError(
                    "Could not auto-detect SageMaker role. "
                    "Either run from a SageMaker notebook or set SAGEMAKER_ROLE_ARN env var."
                )
            return role
    return role_arg


def upload_dataset(csv_path: str) -> str:
    """Upload dataset CSV to S3 and return the S3 URI."""
    s3     = boto3.client("s3", region_name=AWS_REGION)
    fname  = Path(csv_path).name
    s3_key = f"data/{fname}"

    try:
        s3.create_bucket(Bucket=S3_BUCKET)
    except Exception:
        pass   # bucket already exists

    s3.upload_file(csv_path, S3_BUCKET, s3_key)
    s3_uri = f"s3://{S3_BUCKET}/{s3_key}"
    print(f"  ☁️  Dataset uploaded: {s3_uri}")
    return s3_uri


def launch_xgboost_job(
    data_s3_uri: str,
    role_arn: str,
    target_col: str = "churn",
    use_spot: bool = True,
) -> str:
    """
    Launch a SageMaker XGBoost training job using the built-in container.
    Returns the training job name.
    """
    from sagemaker.xgboost import XGBoost

    estimator = XGBoost(
        entry_point="train_sagemaker.py",
        source_dir=str(Path(__file__).parent),
        role=role_arn,
        instance_count=1,
        instance_type="ml.m5.large",
        framework_version="1.7-1",
        py_version="py3",
        use_spot_instances=use_spot,
        max_wait=3600 if use_spot else None,
        max_run=1800,
        output_path=f"s3://{S3_BUCKET}/output/",
        code_location=f"s3://{S3_BUCKET}/code/",
        base_job_name="raksetu-churn",
        hyperparameters={
            "target-column":  target_col,
            "n-estimators":   200,
            "max-depth":      4,
            "learning-rate":  0.05,
            "output-dir":     "/opt/ml/model",
        },
        environment={
            "S3_BUCKET":    S3_BUCKET,
            "AWS_REGION":   AWS_REGION,
        },
    )

    estimator.fit(
        inputs={"train": data_s3_uri},
        wait=True,
        logs="All",
    )

    job_name = estimator.latest_training_job.name
    print(f"\n  ✅ Training job complete: {job_name}")
    print(f"     Model artifact: s3://{S3_BUCKET}/output/{job_name}/output/model.tar.gz")
    return job_name


def download_model_artifact(job_name: str) -> None:
    """Download trained model weights from S3 to local models/ directory."""
    import tarfile
    import tempfile

    s3         = boto3.client("s3", region_name=AWS_REGION)
    s3_key     = f"output/{job_name}/output/model.tar.gz"
    local_tar  = Path(tempfile.mktemp(suffix=".tar.gz"))
    local_out  = Path("backend/prediction-service/models")
    local_out.mkdir(parents=True, exist_ok=True)

    print(f"\n  📦 Downloading model artifact...")
    s3.download_file(S3_BUCKET, s3_key, str(local_tar))

    with tarfile.open(local_tar) as tar:
        tar.extractall(local_out)

    local_tar.unlink()
    print(f"  💾 Model extracted to: {local_out}")
    print(f"     Files: {list(local_out.glob('*'))}")


def main():
    parser = argparse.ArgumentParser(description="RakSetu SageMaker Launcher")
    parser.add_argument("--data",      required=True,           help="Path to local dataset CSV")
    parser.add_argument("--role",      default="auto",          help="IAM role ARN or 'auto'")
    parser.add_argument("--target",    default="churn",         help="Target column name")
    parser.add_argument("--no-spot",   action="store_true",     help="Disable spot instances")
    parser.add_argument("--skip-download", action="store_true", help="Skip downloading model back")
    args = parser.parse_args()

    print("\n🩸  RakSetu SageMaker Launcher")
    print("=" * 60)

    # Upload data
    print("\n📤 Uploading dataset to S3...")
    data_uri = upload_dataset(args.data)

    # Resolve role
    print("\n🔑 Resolving IAM role...")
    role = get_execution_role(args.role)
    print(f"   Role: {role}")

    use_spot = not args.no_spot
    if use_spot:
        print("   Using Spot instances (up to 90% cost reduction)")
    else:
        print("   Using On-demand instances")

    # Launch training
    print(f"\n🚀 Launching XGBoost training job...")
    job_name = launch_xgboost_job(data_uri, role, args.target, use_spot)

    # Download model weights back locally
    if not args.skip_download:
        download_model_artifact(job_name)
        print("\n  Next step: docker compose restart prediction-service")

    print("\n✅ Done")


if __name__ == "__main__":
    main()
