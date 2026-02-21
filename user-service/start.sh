#!/bin/bash
set -e

echo "==> Seeding user database..."
python seed.py

echo "==> Starting User Service..."
exec uvicorn main:app --host 0.0.0.0 --port "${SERVICE_PORT:-8001}"
