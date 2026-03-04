#!/usr/bin/env bash
# build-and-push.sh — Build and push all service images to ACR
#
# IMPORTANT: AKS node pool uses ARM64 VM SKU (e.g. Standard_D2pds_v5).
#            Images MUST be built for linux/arm64.
#
# Usage (run from repo root):
#   ./k8s/build-and-push.sh
#
# Prerequisites:
#   - Run from WSL2 or a Linux terminal (not Windows PowerShell)
#   - az acr login --name pavaniperfdemo

set -euo pipefail

REGISTRY="pavaniperfdemo.azurecr.io"
PLATFORM="linux/arm64"

echo "=================================================="
echo " ai-perf-ecosystem — Build & Push Images"
echo " Registry : $REGISTRY"
echo " Platform : $PLATFORM  ← AKS node pool is ARM64"
echo "=================================================="

az acr login --name pavaniperfdemo

for svc in user-service product-service order-service; do
  echo ""
  echo "Building $svc..."
  docker build \
    --platform "$PLATFORM" \
    --no-cache \
    --provenance=false \
    -t "$REGISTRY/$svc:latest" \
    "./$svc"

  echo "Pushing $svc..."
  docker push "$REGISTRY/$svc:latest"

  ARCH=$(docker inspect "$REGISTRY/$svc:latest" | grep '"Architecture"' | tr -d ' ",' | cut -d: -f2)
  echo "  ✓ $svc pushed — Architecture: $ARCH"
done

echo ""
echo "=================================================="
echo " All images built and pushed."
echo " Run ./k8s/deploy.sh to deploy to AKS."
echo "=================================================="
