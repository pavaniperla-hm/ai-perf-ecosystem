#!/usr/bin/env bash
# deploy.sh — Deploy ai-perf-ecosystem to AKS
# Usage: ./k8s/deploy.sh
#
# Prerequisites:
#   az login
#   az aks get-credentials --resource-group <rg> --name aks-perf-demo

set -euo pipefail

CLUSTER="aks-perf-demo"
NAMESPACE="perf-demo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=================================================="
echo " ai-perf-ecosystem — Kubernetes Deploy"
echo " Cluster  : $CLUSTER"
echo " Namespace: $NAMESPACE"
echo "=================================================="

# ── 0. Confirm correct cluster context ────────────────────────────────────────
CURRENT_CTX=$(kubectl config current-context 2>/dev/null || echo "none")
echo ""
echo "[1/6] Cluster context: $CURRENT_CTX"
if [[ "$CURRENT_CTX" != *"$CLUSTER"* ]]; then
  echo "  WARNING: current context does not match $CLUSTER"
  echo "  Run: az aks get-credentials --resource-group <rg> --name $CLUSTER"
  read -rp "  Continue anyway? (y/N): " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# ── 1. Namespace ──────────────────────────────────────────────────────────────
echo ""
echo "[2/6] Applying namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

# ── 2. Secrets ────────────────────────────────────────────────────────────────
echo ""
echo "[3/6] Applying secrets..."
kubectl apply -f "$SCRIPT_DIR/secrets.yaml"

# ── 3. PostgreSQL databases ───────────────────────────────────────────────────
echo ""
echo "[4/6] Applying PostgreSQL deployments (PVCs + Deployments + Services)..."
kubectl apply -f "$SCRIPT_DIR/postgres/user-db.yaml"
kubectl apply -f "$SCRIPT_DIR/postgres/product-db.yaml"
kubectl apply -f "$SCRIPT_DIR/postgres/order-db.yaml"

echo "  Waiting for databases to be ready..."
kubectl rollout status deployment/user-db    -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/product-db -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/order-db   -n "$NAMESPACE" --timeout=120s
echo "  All databases ready."

# ── 4. Application services ───────────────────────────────────────────────────
echo ""
echo "[5/6] Applying application services..."
kubectl apply -f "$SCRIPT_DIR/user-service/"
kubectl apply -f "$SCRIPT_DIR/product-service/"
kubectl apply -f "$SCRIPT_DIR/order-service/"

echo "  Waiting for services to be ready..."
kubectl rollout status deployment/user-service    -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/product-service -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/order-service   -n "$NAMESPACE" --timeout=120s
echo "  All services ready."

# ── 5. Print external IPs ─────────────────────────────────────────────────────
echo ""
echo "[6/6] Fetching external IPs (may take 1-2 min for LoadBalancer provisioning)..."
echo "  Waiting for LoadBalancer IPs..."
for svc in user-service product-service order-service; do
  echo -n "  $svc: "
  for i in $(seq 1 24); do
    IP=$(kubectl get svc "$svc" -n "$NAMESPACE" \
         -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    if [[ -n "$IP" ]]; then
      echo "http://$IP"
      break
    fi
    sleep 5
    echo -n "."
  done
  [[ -z "$IP" ]] && echo " (still pending — run: kubectl get svc -n $NAMESPACE)"
done

echo ""
echo "=================================================="
echo " Deploy complete!"
echo " All resources in namespace: $NAMESPACE"
echo ""
echo " Useful commands:"
echo "   kubectl get all -n $NAMESPACE"
echo "   kubectl get svc  -n $NAMESPACE"
echo "   kubectl logs -n $NAMESPACE deploy/user-service"
echo "   kubectl logs -n $NAMESPACE deploy/product-service"
echo "   kubectl logs -n $NAMESPACE deploy/order-service"
echo "=================================================="
