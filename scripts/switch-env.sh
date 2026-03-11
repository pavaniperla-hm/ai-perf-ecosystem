#!/bin/bash
# switch-env.sh — switch between local Docker and AKS environments
# Usage: ./scripts/switch-env.sh [local|aks]

set -e
ENV=${1:-local}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Merge .env.source into .env — updates non-secret config lines, preserves existing secret values
merge_env() {
  local source="$1"
  local target="$ROOT/.env"
  local secret_keys="GRAFANA_API_TOKEN|K6_PROMETHEUS_RW_PASSWORD|LOKI_PASSWORD|DYNATRACE_API_TOKEN"

  # Preserve current secret values from target (if it exists)
  declare -A secrets
  if [ -f "$target" ]; then
    while IFS='=' read -r key val; do
      [[ "$key" =~ ^($secret_keys)$ ]] && secrets["$key"]="$val"
    done < <(grep -E "^($secret_keys)=" "$target" | tr -d '\r')
  fi

  # Copy source config as the new base
  cp "$source" "$target"

  # Re-inject preserved secret values (uncommented)
  for key in "${!secrets[@]}"; do
    # Remove any existing line (commented or not) for this key
    sed -i "/^#\? *${key}=/d" "$target"
    echo "${key}=${secrets[$key]}" >> "$target"
  done
}

case "$ENV" in
  aks)
    cp "$ROOT/.env.aks" "$ROOT/.env.active"
    merge_env "$ROOT/.env.aks"
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
    echo "  3. Verify pods: kubectl get pods -n perf-demo"
    ;;
  local)
    cp "$ROOT/.env.local" "$ROOT/.env.active"
    merge_env "$ROOT/.env.local"
    echo ""
    echo "Switched to local Docker environment"
    echo ""
    echo "Checklist:"
    echo "  1. Start the stack:  docker compose up -d"
    echo "  2. Verify health:    curl http://localhost/health"
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
