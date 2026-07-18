#!/bin/sh
# This file is part of Plum.
# Licensed under the MIT License. See LICENSE file in the project root for details.
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec node server.js
