#!/bin/bash
# ============================================
# Deploy / Update Boekhouder
# Run from /var/www/boekhouder
# ============================================

set -e

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Installing dependencies ==="
npm ci

echo "=== Generating Prisma client ==="
npx prisma generate

echo "=== Running database migrations ==="
npx prisma db push

echo "=== Building Next.js ==="
npm run build

echo "=== Restarting app ==="
pm2 stop boekhouder 2>/dev/null || true
pm2 start npm --name "boekhouder" -- start
pm2 save

echo "=== Deploy complete! ==="
echo "App is running on http://localhost:3000"
