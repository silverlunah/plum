#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding from legacy JSON files..."
node config/scripts/seed.js

echo "Starting server..."
exec node server.js
