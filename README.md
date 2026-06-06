# 🩸 RakSetu — Lifeline Bridge
### Blood Warriors · AI donor-patient matching · AWS + Bedrock edition

---

## Quick start (local demo, no AWS needed)

```bash
tar -xzf raksetu_complete.tar.gz && cd raksetu
cp .env.example .env          # DEMO_MODE=true by default
cd backend && docker compose up postgres redis -d
cd ../ml/synthetic_data && pip install asyncpg numpy pandas
python generate.py --patients 200 --donors 1000 --seed 42
python seed_db.py
cd ../../backend && docker compose up -d
cd ../frontend && npm install && npm run dev
# open http://localhost:3000 — login: +919876543210 / demo1234
```

## AWS deployment (hackathon day)

```bash
# 1. SSH into EC2 t3.micro (Ubuntu 24.04)
chmod +x infra/ec2_setup.sh && ./infra/ec2_setup.sh
# log out and back in

# 2. AWS setup (do this FIRST, before spending a cent)
pip3 install boto3 && python3 infra/setup_aws_budget.py --email you@email.com
aws configure   # enter hackathon keys

# 3. Enable Bedrock model access
# AWS Console → Bedrock → Model access → Enable:
#   amazon.nova-micro-v1:0
#   amazon.nova-lite-v1:0

# 4. Configure and deploy
cp .env.example .env && nano .env   # set JWT_SECRET, AWS keys, DEMO_MODE=false
cd frontend && npm install && npm run build && cd ..
docker compose -f infra/docker-compose.prod.yml up -d
cd ml/synthetic_data && python3 generate.py && python3 seed_db.py
```

## Day-of training (when dataset is handed to you)

```bash
# Step 1 — inspect (5 min)
python ml/training/inspect_dataset.py dataset.csv --suggest-mapping

# Step 2 — edit COLUMN_MAP in ml/training/train_pipeline.py (5 min)

# Step 3 — train (15 min)
pip install xgboost scikit-learn torch boto3
python ml/training/train_pipeline.py --data dataset.csv --target churn

# Step 4 — reload services (2 min)
docker compose restart prediction-service matching-service
```

## Architecture

9 FastAPI microservices on one EC2 t3.micro + nginx.
LLM: Amazon Bedrock Nova Lite (multilingual stories) + Nova Micro (cheapest classification).
ML: XGBoost churn prediction + BiLSTM Hb-drop forecasting — trained on hackathon dataset.
Privacy: Flower federated learning — model gradients only, no raw patient data shared.
