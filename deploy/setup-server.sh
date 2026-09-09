#!/bin/bash
# ============================================
# Hetzner Server Setup Script for Boekhouder
# Run this on a fresh Ubuntu 24.04 VPS
# Usage: ssh root@YOUR_IP 'bash -s' < deploy/setup-server.sh
# ============================================

set -e

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "=== Installing PostgreSQL ==="
apt install -y postgresql postgresql-contrib

echo "=== Installing Nginx ==="
apt install -y nginx

echo "=== Installing PM2 ==="
npm install -g pm2

echo "=== Installing Certbot (SSL) ==="
apt install -y certbot python3-certbot-nginx

echo "=== Setting up PostgreSQL ==="
sudo -u postgres psql -c "CREATE USER boekhouder WITH PASSWORD 'boekhouder_secure_password_change_me';"
sudo -u postgres psql -c "CREATE DATABASE boekhouder OWNER boekhouder;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE boekhouder TO boekhouder;"

echo "=== Creating app directory ==="
mkdir -p /var/www/boekhouder

echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Clone your repo: cd /var/www && git clone YOUR_REPO_URL boekhouder"
echo "2. Create .env file: nano /var/www/boekhouder/.env"
echo "3. Run deploy script: cd /var/www/boekhouder && bash deploy/deploy.sh"
echo "4. Configure Nginx: bash deploy/setup-nginx.sh YOUR_DOMAIN"
echo ""
echo "PostgreSQL credentials:"
echo "  Database: boekhouder"
echo "  User: boekhouder"
echo "  Password: boekhouder_secure_password_change_me"
echo "  Connection: postgresql://boekhouder:boekhouder_secure_password_change_me@localhost:5432/boekhouder"
