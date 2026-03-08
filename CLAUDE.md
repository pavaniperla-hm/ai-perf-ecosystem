# CLAUDE.md — AI Performance Engineering Ecosystem

This file gives Claude Code full context so any new session can pick up exactly where the previous one left off.

---

## Project Overview

**AI Performance Engineering Ecosystem** is a hands-on demo project that automates the full performance testing lifecycle using AI agents. It runs against a realistic 3-service e-commerce microservices stack deployed in both a local Docker environment and Azure Kubernetes Service (AKS).

The pipeline is driven by five specialised Claude Code agents:
- **Orchestrator** — coordinates the full pipeline, routes to the correct bug tracker based on environment
- **Health Check Agent** — pre-flight validation of services, pods, and DB connections before any test runs
- **Data Agent** — queries live PostgreSQL DBs via MCP and generates parameterised k6 CSV test data
- **Execution Agent** — runs k6 load tests and captures results
- **Analysis Agent** — interprets results, queries Loki for error logs, raises bugs in Jira (local) or Azure DevOps (AKS)

**Dual environments:**
| Environment | Target | Bug Tracker |
|---|---|---|
| `local` | `http://localhost:8080` | Jira (`SCRUM` project) |
| `aks` | `http://20.82.174.115` | Azure DevOps |

**Observability:** Grafana Cloud (Prometheus remote write + Loki log shipping). Dynatrace integration pending.

---

## Architecture

```
  ┌───────────────────────────────────────────────────────┐
  │                   Claude Code Agents                  │
  │  Orchestrator → HealthCheck → Data → Execution → Analysis
  └───────────────────────────────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               │                         │
         Local Docker               AKS (northeurope)
         localhost:8080           http://20.82.174.115
               │                         │
       ┌───────┴──────┐         ┌────────┴──────┐
       │  Nginx :8080 │         │  Nginx Ingress│
       └──┬──────┬────┘         └──┬──────┬─────┘
          │      │                 │      │
   user-svc  product-svc     user-svc  product-svc
   order-svc                order-svc
          │                         │
   ┌──────┴──────┐         ┌────────┴──────┐
   │  3x Postgres│         │  3x Postgres  │
   │  :5433-5435 │         │  (via PVC)    │
   └─────────────┘         └───────────────┘
```

**Application services:**

| Service | Port (local) | Description |
|---|---|---|
| nginx (gateway) | 8080 | Routes /api/* to services |
| user-service | 8001 | Python FastAPI — users CRUD |
| product-service | 8002 | Node.js Express — products CRUD |
| order-service | 8003 | Python FastAPI — orders CRUD |
| frontend | 3000 | React SPA |
| user-db | 5433 | PostgreSQL — userdb (10K rows) |
| product-db | 5434 | PostgreSQL — productdb (5K rows) |
| order-db | 5435 | PostgreSQL — orderdb (50K rows) |

---

## Quick Start

### Run pipeline against AKS
```powershell
# PowerShell
.\scripts\switch-env.ps1 -env aks
```
Then prompt the Orchestrator agent:
> "Run the full performance pipeline for checkout regression against AKS"

### Run pipeline against local Docker
```powershell
.\scripts\switch-env.ps1 -env local
docker compose up -d
```
Then prompt the Orchestrator agent:
> "Run the full performance pipeline for checkout regression against local"

---

## Environment Setup

### Local prerequisites
- Docker Desktop running
- `docker compose up -d` (all 8 services healthy)
- `set -a && source <(tr -d '\r' < .env) && set +a` (load Grafana tokens)

### AKS prerequisites
- `az aks get-credentials --resource-group rg-perf-demo --name aks-perf-demo`
- All 8 pods running: `kubectl get pods -n perf-demo`
- Port-forwards active for MCP DB access:
  ```bash
  kubectl port-forward -n perf-demo svc/user-db 15433:5432 &
  kubectl port-forward -n perf-demo svc/product-db 15434:5432 &
  kubectl port-forward -n perf-demo svc/order-db 15435:5432 &
  ```
- Grafana token pasted into `.env` (`GRAFANA_API_TOKEN`, `K6_PROMETHEUS_RW_PASSWORD`, `LOKI_PASSWORD`)

### Environment files
| File | Description |
|---|---|
| `.env.local` | Local Docker config — committed, no secrets |
| `.env.aks` | AKS cloud config — committed, no secrets |
| `.env` | Active env + secrets (gitignored) |
| `.env.active` | Active env marker, no secrets (gitignored) |

---

## MCP Servers

| MCP Server | Environment | Database | Port |
|---|---|---|---|
| `user-db` | local | userdb | 5433 |
| `product-db` | local | productdb | 5434 |
| `order-db` | local | orderdb | 5435 |
| `user-db-aks` | aks | userdb | 15433 (port-forward) |
| `product-db-aks` | aks | productdb | 15434 (port-forward) |
| `order-db-aks` | aks | orderdb | 15435 (port-forward) |
| `mcp-atlassian` | local | Jira (SCRUM project) | cloud |
| `azure-devops` | aks | Azure DevOps | cloud |

**Always read `.env.active` first to determine which MCP servers to use.**

---

## Agent Pipeline

| Step | Agent | File | Description |
|---|---|---|---|
| 0 | Health Check | `agents/healthcheck-agent.md` | Validates services, pods, DB connectivity. Stops pipeline on failure. |
| 1 | Data | `agents/data-agent.md` | Queries live DBs via MCP, generates `k6/data/test-data-checkout.csv` |
| 2 | Execution | `agents/execution-agent.md` | Runs k6 baseline/stress/realistic test, writes JSON + HTML results |
| 3 | Analysis | `agents/analysis-agent.md` | Interprets k6 results, queries Loki for errors, determines PASS/FAIL |
| 4 | Reporting | `agents/reporting-agent.md` | Creates Jira issue (local) or Azure DevOps work item (AKS) with evidence |

**Orchestrator file:** `agents/orchestrator.md`

### Pipeline handoff
```
Orchestrator
  → Health Check Agent  (HEALTH_CHECK_PASSED / HEALTH_CHECK_FAILED)
  → Data Agent          (file_path, row_count, environment)
  → Execution Agent     (results_json, html_report, summary stats)
  → Analysis Agent      (verdict: PASS/FAIL, threshold_breaches, loki_errors)
  → Reporting Agent     (ticket_url, ticket_id)
```

---

## k6 Test Scripts

```
k6/
├── config/
│   ├── config.js              # BASE_URL switcher (TARGET_ENV=local|aks)
│   └── grafana-config.js      # Grafana Cloud Prometheus remote write
├── data/
│   └── test-data-checkout.csv # 500 rows — regenerate when switching envs!
├── scripts/
│   ├── baseline-test.js       # 10 VUs, 2 min — tight thresholds (p95<20ms)
│   ├── stress-test.js         # Stepped ramp 10→25→50→100 VUs
│   ├── peak-load-test.js      # Ramp to 50 VUs, hold 5 min
│   ├── realistic-load-test.js # 4 weighted scenarios
│   └── generate-test-data.js  # Regenerates CSV from any env
└── results/
    └── *.html / *.json        # Auto-generated reports
```

### Running k6 manually
```bash
# With Grafana output (requires .env loaded)
k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js

# Target local Docker
TARGET_ENV=local k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js
```

### Current thresholds (baseline-test.js) — intentionally tight to trigger regression
```
http_req_duration: p(95)<20ms
errors:            rate==0
checks:            rate==1.0
```

### Baseline results (AKS, 2026-03-06, original 1500ms thresholds)
| Transaction | p(95) |
|---|---|
| Login Page | 52ms |
| Products Page | 47ms |
| Product Detail | 42ms |
| Checkout | 56ms |

---

## Observability

### Grafana Cloud
| Setting | Value |
|---|---|
| Stack URL | `https://myperformanceproject.grafana.net` |
| Dashboard | `https://myperformanceproject.grafana.net/d/k6-perf-v3` |
| Prometheus endpoint | `https://prometheus-prod-39-prod-eu-north-0.grafana.net/api/prom/push` |
| Prometheus username | `2997542` |
| Loki endpoint | `https://logs-prod-025.grafana.net` |
| Loki username | `1494446` |

### Loki queries
| Environment | Query |
|---|---|
| local | `{job="docker-compose"} \|= "error"` |
| aks | `{namespace="perf-demo"} \|= "error"` |

Token: stored in `.env` as `GRAFANA_API_TOKEN` / `LOKI_PASSWORD` (same value, never committed).

### Log shipping
- **Local:** Promtail in docker-compose with Docker socket discovery, `job="docker-compose"`
- **AKS:** Promtail DaemonSet in `k8s/promtail/` — ships all pod logs, `namespace="perf-demo"`

---

## AKS Deployment

### Cluster details
| Property | Value |
|---|---|
| Cluster | `aks-perf-demo` |
| Resource Group | `rg-perf-demo` |
| Region | `northeurope` |
| Namespace | `perf-demo` |
| Node Architecture | ARM64 (Ampere) |
| ACR | `pavaniperfdemo.azurecr.io` |
| Public IP | `20.82.174.115` |

### k8s directory structure
```
k8s/
├── namespace.yaml
├── secrets.yaml
├── postgres/           # user-db, product-db, order-db (PVC + Deployment + Service)
├── user-service/
├── product-service/
├── order-service/
├── frontend/
├── ingress/            # Nginx ingress — 4 Ingress objects
├── promtail/           # DaemonSet log shipping to Loki
├── deploy.sh
└── build-and-push.sh   # ARM64 images via WSL2
```

---

## Known Issues & Fixes

### 1. Stale CSV after switching environments
**Symptom:** `Login Page | User returned` check fails 100%; error_rate=25%, checks=87.5% despite HTTP 200.
**Cause:** Local and AKS DBs have completely different seed data — emails don't match across environments.
**Fix:** Always regenerate CSV after switching:
```bash
# After switching to local:
cd k6 && node scripts/generate-test-data.js local

# After switching to AKS (port-forwards must be active first):
kubectl port-forward -n perf-demo svc/user-db 15433:5432 &
kubectl port-forward -n perf-demo svc/product-db 15434:5432 &
kubectl port-forward -n perf-demo svc/order-db 15435:5432 &
cd k6 && node scripts/generate-test-data.js aks
```

### 2. Windows Docker IPv6 binding (ECONNRESET)
**Symptom:** `generate-test-data.js` fails with ECONNRESET when connecting to local DBs.
**Cause:** `localhost` resolves to `::1` (IPv6) on Windows, but Docker binds on `0.0.0.0` (IPv4).
**Fix:** `generate-test-data.js` uses `127.0.0.1` everywhere (already fixed). Never use `localhost` for Docker DB connections on Windows.
**Secondary:** Run from `k6/` directory (not `k6/scripts/`) so `node_modules/pg` is found:
```bash
cd k6 && node scripts/generate-test-data.js local
```

### 3. AKS images must be ARM64 built from WSL2
**Cause:** AKS node pool is Ampere ARM64. Docker Desktop on Windows produces OCI manifest indexes that AKS containerd rejects.
**Fix:** Always build from WSL2 with `--platform linux/arm64 --provenance=false`.

### 4. Grafana Cloud token — use same token for Prometheus and Loki
The `k6-metrics-write-k6-token` has both `metrics:write` and `logs:write` scope. Use the same token for `GRAFANA_API_TOKEN`, `K6_PROMETHEUS_RW_PASSWORD`, and `LOKI_PASSWORD`.
When creating AKS secrets, strip CRLF with `tr -d '\r'` to avoid silent token corruption.

### 5. nginx host port mapped to 8080 (not 80)
**Cause:** Windows IPv6/WSL conflict on port 80.
**Fix:** nginx is mapped to `127.0.0.1:8080:80` in docker-compose. Local k6 target is `http://localhost:8080`.

### 6. Windows CRLF in shell scripts
Git on Windows converts LF→CRLF. Shell scripts baked into Docker images get `exec format error` on Linux.
**Fix:** `.gitattributes` enforces `eol=lf` for all `.sh`, `.py`, `Dockerfile` files.
