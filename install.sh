#!/bin/bash
# RakSetu EC2 Deployment Script
# Run this script on your fresh Ubuntu EC2 instance

set -e # Exit immediately if a command exits with a non-zero status

echo "=========================================="
echo "🚀 Starting RakSetu EC2 Deployment Setup"
echo "=========================================="

echo "1. Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

echo "2. Installing Docker and Docker Compose..."
# Add Docker's official GPG key:
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y

# Install Docker packages
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Ensure docker runs without sudo (takes effect on next login, but we'll use sudo for now)
sudo usermod -aG docker $USER

echo "3. Cloning RakSetu Repository..."
# Remove directory if it exists to ensure a fresh clone
rm -rf RakSetu
git clone https://github.com/nikhiljainnnn/RakSetu.git
cd RakSetu

echo "4. Setting up Environment Variables..."
# Copy the example env to actual env in the backend
cp backend/.env.example backend/.env 2>/dev/null || touch backend/.env

# Create a secure JWT secret and add it to the .env file
JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$JWT_SECRET" | sudo tee -a backend/.env
echo "DEMO_MODE=false" | sudo tee -a backend/.env

echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo "Next steps:"
echo "1. Open backend/.env and add your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
echo "   Command: nano backend/.env"
echo "2. Start the application by running:"
echo "   sudo docker compose -f backend/docker-compose.yml up -d --build"
echo "=========================================="
