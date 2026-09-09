#!/bin/bash
set -e

# This script baselines the remote database.
# It marks all existing migrations as applied so Prisma doesn't try to recreate them.

REMOTE_HOST="65.21.107.54"
REMOTE_DIR="/var/www/boekhouder"

echo "Listing migrations..."
MIGRATIONS=$(ls prisma/migrations | grep -v "migration.sql" | sort)

for MIGRATION in $MIGRATIONS; do
  if [ -d "prisma/migrations/$MIGRATION" ]; then
    echo "Marking $MIGRATION as applied on remote..."
    ssh root@$REMOTE_HOST "cd $REMOTE_DIR && npx prisma migrate resolve --applied $MIGRATION"
  fi
done