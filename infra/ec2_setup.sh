#!/bin/bash
# RakSetu EC2 Setup Script
# Run once after SSHing into a fresh Ubuntu 24.04 t3.micro instance.
# Usage: chmod +x ec2_setup.sh && ./ec2_setup.sh

set -e   # exit on any error

echo ""
echo "🩸 RakSetu EC2 Setup"
echo "=================================================="

# ── System update ─────────────────────────────────────────────────────────────
echo ""
echo "📦 Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── Docker ────────────────────────────────────────────────────────────────────
echo ""
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
sudo systemctl enable docker
sudo systemctl start docker

# ── Docker Compose plugin ─────────────────────────────────────────────────────
echo ""
echo "🐳 Installing Docker Compose..."
sudo apt-get install -y docker-compose-plugin

# ── Python 3.11 + pip ─────────────────────────────────────────────────────────
echo ""
echo "🐍 Installing Python 3.11..."
sudo apt-get install -y python3.11 python3-pip python3.11-venv

# ── Node 20 (for building frontend) ──────────────────────────────────────────
echo ""
echo "⬡ Installing Node 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── AWS CLI ───────────────────────────────────────────────────────────────────
echo ""
echo "☁️  Installing AWS CLI..."
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
sudo apt-get install -y unzip
unzip -q /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

# ── Git ───────────────────────────────────────────────────────────────────────
sudo apt-get install -y git

# ── Billing alarm reminder ────────────────────────────────────────────────────
echo ""
echo "⚠️  IMPORTANT: Set AWS billing alarm NOW before doing anything else."
echo "   AWS Console → Billing → Budgets → Create budget"
echo "   Set threshold: \$30 USD, alert to your email"
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo "=================================================="
echo "✅ EC2 setup complete."
echo ""
echo "Next steps:"
echo "  1. Log out and back in (so docker group takes effect)"
echo "  2. Run: aws configure  (enter your hackathon AWS keys)"
echo "  3. Upload your project: git clone or scp"
echo "  4. cd raksetu && cp .env.example .env && nano .env"
echo "  5. cd frontend && npm install && npm run build"
echo "  6. cd ../ && docker compose -f infra/docker-compose.prod.yml up -d"
echo "  7. cd ml/synthetic_data && python3 generate.py && python3 seed_db.py"
echo ""
