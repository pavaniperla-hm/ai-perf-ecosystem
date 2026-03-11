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

**Observability:** Grafana Cloud (Prometheus remote write + Loki log shipping) + Dynatrace OneAgent (applicationMonitoring mode, injected into all perf-demo pods).

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
| 2 | Execution | `agents/execution-agent.md` | Runs k6 test, writes raw **JSON only** — does NOT generate HTML |
| 3 | Analysis | `agents/analysis-agent.md` | Interprets k6 results, queries Loki for errors, determines PASS/FAIL |
| 4 | Reporting | `agents/reporting-agent.md` | **Sole owner of HTML report.** Collects kubectl/DB/DT/Loki evidence, generates full HTML, creates ticket |

**Orchestrator file:** `agents/orchestrator.md`

### Pipeline handoff
```
Orchestrator
  → Health Check Agent  (HEALTH_CHECK_PASSED / HEALTH_CHECK_FAILED)
  → Data Agent          (file_path, row_count, environment)
  → Execution Agent     (results_json, summary stats)   ← no HTML
  → Analysis Agent      (verdict: PASS/FAIL, threshold_breaches, loki_errors)
  → Reporting Agent     (full HTML report, CSV row, ticket_url)
```

### Demo Mode — sub-agent pipeline
Each stage runs as an **isolated sub-agent** via the `Agent` tool. All noisy tool calls
(kubectl, curl, k6 output, file reads) stay inside the sub-agent's context. The main
orchestrator thread shows only:
- `╔══╗` stage launch banners (before each Agent tool call)
- `┌──┐` handoff summary cards (parsed from each agent's `AGENT_RESULT_START/END` block)
- Final `══` pipeline summary

Each agent ends its response with a structured `AGENT_RESULT_START / AGENT_RESULT_END` block
that the orchestrator parses to build the handoff card. This keeps the demo clean for audiences.

**Prompt to trigger the full pipeline:**
> "Run a regression test on AKS"

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
│   ├── regression-test.js     # DEFAULT — 4 scenarios, ramp to 20 VUs, 2 min, p95<30ms
│   ├── baseline-test.js       # 10 VUs, 2 min — tight thresholds (p95<20ms)
│   ├── stress-test.js         # Stepped ramp 10→25→50→100 VUs (~20 min)
│   ├── peak-load-test.js      # Ramp to 50 VUs, hold 5 min (~15 min)
│   ├── realistic-load-test.js # 4 weighted scenarios, full ramp/hold (13 min)
│   └── generate-test-data.js  # Regenerates CSV from any env
└── results/
    └── *.html / *.json        # Auto-generated reports
```

### Running k6 manually
```bash
# Default regression test (2 min, 4 scenarios, ramp to 20 VUs)
k6 run --out experimental-prometheus-rw k6/scripts/regression-test.js

# Baseline steady-state test
k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js

# Target local Docker instead of AKS
TARGET_ENV=local k6 run --out experimental-prometheus-rw k6/scripts/regression-test.js
```

### Thresholds — intentionally tight to always trigger regression on real network
| Script | Threshold | Comment |
|---|---|---|
| `regression-test.js` | `p(95)<30ms` per transaction | AKS actual ~50ms → always FAIL |
| `baseline-test.js` | `p(95)<20ms` overall | AKS actual ~52ms → always FAIL |
| `realistic-load-test.js` | `p(95)<1000-2000ms` | Realistic — may PASS on AKS |
| `stress-test.js` / `peak-load-test.js` | `p(95)<1500ms` | May PASS at lower VUs |

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

## Dynatrace

### Credentials
| Variable | Where stored | Notes |
|---|---|---|
| `DYNATRACE_URL` | `.env.aks` (committed) | `https://kun86120.live.dynatrace.com` |
| `DYNATRACE_API_TOKEN` | `.env` (gitignored) | Full-scope token — see token name in DT UI |
| `DYNATRACE_ENABLED` | `.env.aks` = `true`, `.env.local` = `false` | Controls analysis-agent deep-dive |
| `DYNATRACE_NAMESPACE_FILTER` | `.env.aks` (committed) | `perf-demo` |

Token is read by `analysis-agent.md` (Step 3 — Dynatrace Deep Dive) from `.env`.
The same token is stored in the `dynakube` k8s secret (`apiToken` field) for operator auth.

### Deployment
- **Operator:** v1.8.1 installed via `https://github.com/Dynatrace/dynatrace-operator/releases/latest/download/kubernetes.yaml`
- **Namespace:** `dynatrace`
- **Mode:** `applicationMonitoring` + `activeGate` — code modules injected via init container (CSI-less). No OneAgent DaemonSet. Works on ARM64 nodepool1 where a full DaemonSet cannot run.
- **Tenant:** `https://kun86120.live.dynatrace.com`
- **Secret:** `dynakube` in `dynatrace` namespace (apiToken + paasToken)
- **Manifest:** `k8s/dynatrace/dynakube.yaml`

### Pod status (all Running)
```
dynakube-activegate-0      1/1 Running  aks-monitoring (amd64)
dynatrace-operator         1/1 Running  aks-nodepool1  (arm64)
dynatrace-webhook          1/1 Running  aks-nodepool1  (arm64)
```
Note: No `dynakube-oneagent-*` DaemonSet — `applicationMonitoring` mode uses an init container (`dynatrace-operator`) injected per pod instead.

### Node pool architecture
OneAgent and ActiveGate container images are **amd64-only**. The main app node pool (`nodepool1`) is ARM64. A dedicated amd64 node pool was added to host Dynatrace components:

| Node pool | VM SKU | Arch | Taint | Purpose |
|---|---|---|---|---|
| `nodepool1` | Standard_B2ps_v2 | ARM64 | none | App workloads |
| `monitoring` | Standard_D2s_v3 | amd64 | `monitoring=true:NoSchedule` | Dynatrace only |

Both OneAgent and ActiveGate pin to `nodepool=monitoring` via `nodeSelector` + toleration.

### Monitored namespaces
The operator auto-labels namespaces. Currently injecting into: `default`, `ingress-nginx`, `perf-demo`.
Verify: `kubectl get namespace perf-demo --show-labels` — look for `dynakube.internal.dynatrace.com/instance=dynakube`.

### Webhook CPU
The `dynatrace-webhook` default CPU request is 300m. Patched to 100m request / 300m limit to fit the ARM64 node. Can be restored to 300m if the node is upgraded.

### Scale-down lesson: Dynatrace PDB blocks node drain
The `dynatrace-webhook` PodDisruptionBudget (`MinAvailable: 1`) blocks AKS node drain when there is only 1 webhook pod. If you need to drain/replace the ARM64 node:
```bash
kubectl delete pdb dynatrace-webhook -n dynatrace
# perform drain / scale operation
# operator will recreate the PDB automatically
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

### 7. Dynatrace Python sitecustomize `KeyError: 'sitecustomize'` — harmless
**Symptom:** Pod startup logs show:
```
Error in sitecustomize; set PYTHONVERBOSE for traceback:
KeyError: 'sitecustomize'
```
**Cause:** DT's `sitecustomize.py` calls `__import__("sitecustomize")` to chain to the next sitecustomize in Python's path. When none exists, Python's `site.py` catches the resulting `KeyError` and prints this warning.
**Impact:** None. `_load_agent()` runs and completes successfully *before* the chaining step. The C-level agent reaches `LifeCycleState.RUNNING` and Python sensors (FastAPI, psycopg2) are active. Confirmed: DT entities API shows `User Service` and `Order Service` as monitored services.
**Action:** No fix needed — safe to ignore this log line.

### 8. Dynatrace `dt_slowest_ms` / `dt_db_pct` always null — token scope limitation
**Symptom:** Analysis CSV shows `dt_slowest_ms=` (empty), `dt_db_pct=null`, `dt_db_bottleneck=false` even though DT is actively monitoring all services.
**Cause:** The DT API token has `metrics.ingest` scope only — `metrics.read` is not granted. The analysis agent therefore skips all metrics-level queries (response time breakdown, DB time %) and returns null for those fields.
**Impact:** DT can still detect monitored entities and open problems. Service-level timing data is unavailable via the analysis agent.
**Fix:** To populate these fields, create a new DT API token with `metrics.read` scope added, update `DYNATRACE_API_TOKEN` in `.env`, and update the `dynakube` k8s secret accordingly.

### 9. HTML report missing cluster/DB/observability sections — ownership confusion
**Symptom:** HTML report only has basic metrics (KPIs, charts, threshold table) — no Cluster Resource Usage, Database Load, Observability Evidence, Root Cause Analysis, or Next Steps sections.
**Cause:** The execution agent's `Demo Return Contract` included `html_report` in its output block, causing it to generate a minimal HTML as a side effect. The reporting agent then saw the file already existed and skipped its own full generation (`"pre-existing from execution agent — confirmed intact"`).
**Fix (applied):**
- `execution-agent.md`: explicit rule added — *"Do NOT generate an HTML report"*. `html_report` removed from return contract.
- `reporting-agent.md`: IMPORTANT note added — *"Always overwrite the HTML even if a file already exists. Reporting agent is the sole HTML owner."*
**Rule:** Execution agent owns the raw k6 JSON only. Reporting agent owns the full HTML (always generates fresh with all 8 sections: KPIs, load profile, thresholds, cluster resources, DB connections, observability evidence, root cause, next steps).
