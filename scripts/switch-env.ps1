param([string]$env = "local")

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

switch ($env) {
    "aks" {
        Copy-Item "$root\.env.aks" "$root\.env.active" -Force
        Copy-Item "$root\.env.aks" "$root\.env" -Force
        Write-Host ""
        Write-Host "Switched to AKS environment" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Checklist:" -ForegroundColor Yellow
        Write-Host "  1. Ensure AKS credentials are current:"
        Write-Host "       az aks get-credentials --resource-group rg-perf-demo --name aks-perf-demo"
        Write-Host "  2. Start port-forwards for MCP + k6 DB access:"
        Write-Host "       kubectl port-forward -n perf-demo svc/user-db 15433:5432 &"
        Write-Host "       kubectl port-forward -n perf-demo svc/product-db 15434:5432 &"
        Write-Host "       kubectl port-forward -n perf-demo svc/order-db 15435:5432 &"
        Write-Host "  3. Paste your Grafana token into .env (K6_PROMETHEUS_RW_PASSWORD)"
        Write-Host "  4. Verify pods: kubectl get pods -n perf-demo"
    }
    "local" {
        Copy-Item "$root\.env.local" "$root\.env.active" -Force
        Copy-Item "$root\.env.local" "$root\.env" -Force
        Write-Host ""
        Write-Host "Switched to local Docker environment" -ForegroundColor Green
        Write-Host ""
        Write-Host "Checklist:" -ForegroundColor Yellow
        Write-Host "  1. Start the stack:  docker compose up -d"
        Write-Host "  2. Paste your Grafana token into .env (K6_PROMETHEUS_RW_PASSWORD)"
        Write-Host "  3. Verify health:    curl http://localhost/health"
    }
    default {
        Write-Host "Usage: .\scripts\switch-env.ps1 -env [local|aks]" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Active environment:" -ForegroundColor White
Get-Content "$root\.env.active" | Select-String "^ENVIRONMENT=" | ForEach-Object {
    Write-Host "  $_" -ForegroundColor Cyan
}
Write-Host "  K6_BASE_URL = $(Get-Content "$root\.env.active" | Select-String "^K6_BASE_URL=" | ForEach-Object { $_ -replace "K6_BASE_URL=","" })"
Write-Host ""
