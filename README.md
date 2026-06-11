# 🩸 RakSetu — Lifeline Bridge
### Autonomous AI Blood Donation Command Center 

RakSetu is a next-generation blood donation coordination platform. Built on an event-driven microservice architecture, it utilizes autonomous **LangGraph AI Agents** powered by **Amazon Bedrock**, alongside advanced Machine Learning pipelines, to ensure critical patients receive the blood they need instantly.

---

## 🌟 Key Capabilities

### 🧠 Autonomous Multi-Agent Orchestration
Instead of a standard chatbot, RakSetu acts as an autonomous command center. A **Bedrock Nova Supervisor AI** interprets complex natural language requests and delegates tasks to three specialized agents:
- **Matching Agent**: Scans the hospital database to find, score, and rank compatible blood donors for urgent transfusion requests.
- **Prediction Agent**: Evaluates ML churn scores, conversion probability, and analyzes donor conversation history.
- **Outreach Agent**: Generates deeply personalized, multilingual impact stories and manages communication dispatch.

### ⚙️ Production-Grade MLOps Pipeline
We treat ML models as living systems, not static files:
- **XGBoost Churn Prediction**: Identifies which donors are at high risk of dropping out so interventions can be made.
- **Automated Drift Detection**: A scheduled Celery task constantly monitors live data for behavioral drifts.
- **Zero-Touch Auto-Retraining**: When drift is detected, the system autonomously fetches new data, augments it with failure logs, trains a new model, logs metrics to **MLflow**, and automatically promotes it to production if accuracy improves.

### 📣 Smart Notification Cascade
Using Celery background workers, the notification service guarantees message delivery via an intelligent cascade:
1. **Primary**: Multilingual WhatsApp messages (via Gupshup).
2. **Fallback 1**: If no response in 2 hours, triggers an SMS (via AWS SNS).
3. **Fallback 2**: If still no response in 3 hours, triggers an automated multilingual Voice Call (via Exotel & Sarvam AI).
4. **Self-Improving**: A failure-learning lambda monitors dropped messages and updates the database to prevent repeating the same failed communication channel.

### 🔒 Federated Learning (Privacy First)
RakSetu incorporates Flower (`flwr`) federated learning to build robust models across multiple simulated hospital nodes. Only model gradients are shared with the central aggregator, ensuring raw patient health data never leaves the hospital's local server.

---

## 🏗️ Architecture & Microservices

The backend runs on **9 horizontally scalable FastAPI microservices** behind an Nginx API Gateway, heavily utilizing async execution to prevent freezing.

| Service | Responsibility |
|---------|----------------|
| **`api-gateway`** | Rate limiting, JWT Authentication, and routing. |
| **`matching-service`** | Guardian Circle building and donor compatibility scoring. |
| **`prediction-service`** | Serves XGBoost Churn models, LSTM Hb-drop forecasting, and MLflow/MLOps auto-retraining endpoints. |
| **`notification-service`** | WhatsApp/SMS/Voice dispatch, Celery task scheduling, and conversation memory tracking. |
| **`story-engine`** | Generates highly personalized, multilingual impact stories using Amazon Bedrock/Gemini. |
| **`voice-service`** | IVR handling, DTMF processing, and Text-to-Speech integration. |
| **`federated-aggregator`** | Central Flower server managing global model updates across hospital nodes. |
| **`agent-orchestrator`** | The LangGraph state machine housing the Supervisor and Specialist AIs. |

---

## 🚀 Upgrades & Features Installed

1. **Self-Improving Failure Learner:** Automatically switches a donor's preferred channel if WhatsApp messages continuously fail.
2. **Conversation Memory:** Every outreach attempt and donor reply is logged as conversation context so the AI agents can tailor future messages.
3. **One-Time to Regular Conversion Model:** Uses a specialized ML model to identify one-time donors with the highest statistical probability of becoming recurring "bridge" donors.
4. **Blood Group Awareness Campaign:** A scheduled monthly cron job that reaches out to registered "guests" whose blood types are unknown to safely collect their data.
5. **Urgency Alerts:** Scans the database for critically past-due transfusion requests and triggers high-priority alerts to the hospital staff.

---

## 🛠️ Quick Start (Local Demo)

You can run the entire multi-service architecture locally using Docker Compose.

```bash
# 1. Clone and enter the repository
git clone https://github.com/nikhiljainnnn/RakSetu.git
cd RakSetu

# 2. Configure Environment
cp .env.example .env
# Important: Set DEMO_MODE=true if you do not have AWS Bedrock or Gupshup keys configured!

# 3. Start Database and Redis
cd backend
docker compose up postgres redis -d

# 4. Seed Fake Data (Optional)
cd ../ml/synthetic_data
pip install asyncpg numpy pandas
python generate.py --patients 200 --donors 1000
python seed_db.py

# 5. Start All Microservices
cd ../../backend
docker compose up -d --build

# 6. Start Frontend
cd ../frontend
npm install && npm run dev
```
*Access the frontend at `http://localhost:3000`*

---

## ☁️ AWS Deployment (Production)

To run the live RakSetu platform on AWS EC2:

1. **AWS Bedrock Setup:** Ensure your IAM user has access to `amazon.nova-micro-v1:0` and `amazon.nova-lite-v1:0` in the `us-east-1` region.
2. **Configure Production Env:** 
   Update `.env` with real credentials:
   ```env
   DEMO_MODE=false
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   ```
3. **Deploy:**
   ```bash
   cd backend
   docker compose -f infra/docker-compose.prod.yml up -d --build
   ```
4. **MLflow Dashboard:** Accessible via port `5000` to monitor model versions and data drift.
