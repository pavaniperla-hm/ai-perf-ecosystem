#!/bin/bash
# switch-env.sh — switch between local Docker and AKS environments
# Usage: ./scripts/switch-env.sh [local|aks]

set -e
ENV=${1:-local}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$ENV" in
  aks)
    cp "$ROOT/.env.aks" "$ROOT/.env.active"
    cp "$ROOT/.env.aks" "$ROOT/.env"
    echo ""
    echo "Switched to AKS environment"
    echo ""
    echo "Checklist:"
    echo "  1. Ensure AKS credentials are current:"
    echo "       az aks get-credentials --resource-group rg-perf-demo --name aks-perf-demo"
    echo "  2. Start port-forwards for MCP + k6 DB access:"
    echo "       kubectl port-forward -n perf-demo svc/user-db 15433:5432 &"
    echo "       kubectl port-forward -n perf-demo svc/product-db 15434:5432 &"
    echo "       kubectl port-forward -n perf-demo svc/order-db 15435:5432 &"
    echo "  3. Paste your Grafana token into .env (K6_PROMETHEUS_RW_PASSWORD)"
    echo "  4. Verify pods: kubectl get pods -n perf-demo"
    ;;
  local)
    cp "$ROOT/.env.local" "$ROOT/.env.active"
    cp "$ROOT/.env.local" "$ROOT/.env"
    echo ""
    echo "Switched to local Docker environment"
    echo ""
    echo "Checklist:"
    echo "  1. Start the stack:  docker compose up -d"
    echo "  2. Paste your Grafana token into .env (K6_PROMETHEUS_RW_PASSWORD)"
    echo "  3. Verify health:    curl http://localhost/health"
    ;;
  *)
    echo "Usage: ./scripts/switch-env.sh [local|aks]"
    exit 1
    ;;
esac

echo ""
echo "Active environment:"
grep "^ENVIRONMENT=" "$ROOT/.env.active"
grep "^K6_BASE_URL=" "$ROOT/.env.active"
echo ""
