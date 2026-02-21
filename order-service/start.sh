#!/bin/bash
set -e

echo "==> Seeding order database..."
python seed.py

echo "==> Starting Order Service..."
exec uvicorn main:app --host 0.0.0.0 --port "${SERVICE_PORT:-8003}"
