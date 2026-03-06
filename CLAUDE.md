# CLAUDE.md — AI Performance Engineering Ecosystem

This file gives Claude Code full context about the project, goals, and current state.

---

## Project Overview

**AI Performance Engineering Ecosystem** is a hands-on learning project that combines a realistic e-commerce microservices application with AI-assisted performance engineering workflows.

The goal is to use Claude Code (with MCP database connections, k6, and Playwright) to automate the full performance testing lifecycle: data extraction, script generation, test execution, results analysis, and reporting — with minimal manual effort.

---

## Architecture

```
  Browser / k6
       │
       ▼
  ┌─────────────────────────────────┐
  │      Nginx API Gateway  :80     │
  │  /api/users     → :8001         │
  │  /api/products  → :8002         │
  │  /api/orders    → :8003         │
  └────────┬──────────┬─────────────┘
           │          │         │
           ▼          ▼         ▼
  ┌──────────────┐ ┌──────────┐ ┌──────────────┐
  │ User Service │ │ Product  │ │ Order Service│
  │ Python/FastAPI│ │ Node/    │ │ Python/FastAPI│
  │    :8001     │ │ Express  │ │    :8003     │
  └──────┬───────┘ │  :8002   │ └──────┬───────┘
         │         └────┬─────┘        │
         ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌──────────┐
    │ user-db │   │product-db│   │ order-db │
    │ :5433   │   │  :5434   │   │  :5435   │
    │ 10K rows│   │ 5K rows  │   │ 50K rows │
    └─────────┘   └──────────┘   └──────────┘

  React SPA (frontend) served at :3000
```

---

## Docker Services & Ports

| Service | Container Port | Host Port | Description |
|---|---|---|---|
| `nginx` | 80 | **80** | API gateway — primary entry point |
| `frontend` | 80 | **3000** | React SPA (served by Nginx inside container) |
| `user-service` | 8001 | **8001** | Python FastAPI — users CRUD |
| `product-service` | 8002 | **8002** | Node.js Express — products CRUD |
| `order-service` | 8003 | **8003** | Python FastAPI — orders CRUD |
| `user-db` | 5432 | **5433** | PostgreSQL 15 — `userdb` |
| `product-db` | 5432 | **5434** | PostgreSQL 15 — `productdb` |
| `order-db` | 5432 | **5435** | PostgreSQL 15 — `orderdb` |

**Gateway routes:**
- `GET /api/users`    → user-service:8001
- `GET /api/products` → product-service:8002
- `GET /api/orders`   → order-service:8003

**Start the stack:**
```bash
docker compose up --build
```

---

## PostgreSQL Databases & MCP Connections

Three separate PostgreSQL databases, each with its own MCP server configured in Claude Code.

| MCP Server | Database | Host | Port | User | Password | DB Name |
|---|---|---|---|---|---|---|
| `user-db` | Users | localhost | 5433 | postgres | postgres | userdb |
| `product-db` | Products | localhost | 5434 | postgres | postgres | productdb |
| `order-db` | Orders | localhost | 5435 | postgres | postgres | orderdb |

### Schema Summary

**users** (user-db)
```
id, name, email, phone, address, city, country, created_at
```

**products** (product-db)
```
id, name, description, price, category, stock, created_at
```

**orders** (order-db)
```
id, user_id, product_id, quantity, unit_price, total_price, status, created_at
```
Order statuses: `pending` · `processing` · `shipped` · `delivered` · `cancelled`

### Seed sizes
- `users`: 10,001 rows
- `products`: 5,000 rows
- `orders`: 50,005 rows

---

## Test Data

### Location
```
test-data/
└── test-data-checkout.csv    # 500 rows — k6 parameterised checkout test data
```

### test-data-checkout.csv
Extracted via MCP cross-database join (user-db + order-db + product-db).

**Columns:**
`customer_id`, `customer_email`, `customer_name`, `customer_joined`,
`order_id`, `order_date`, `order_status`,
`product_id`, `product_name`, `product_category`,
`quantity`, `unit_price`, `total_price`

**Criteria:** 500 unique customers with at least one order in the last 90 days, joined with their most recent order and product details.

**k6 usage:**
```js
import { SharedArray } from 'k6/data';
const customers = new SharedArray('customers', () =>
  open('./test-data/test-data-checkout.csv')
    .split('\n').slice(1).filter(Boolean)
    .map(line => {
      const [customer_id, customer_email, customer_name, customer_joined,
             order_id, order_date, order_status,
             product_id, product_name, product_category,
             quantity, unit_price, total_price] = line.split(',');
      return { customer_id, customer_email, customer_name,
               product_id, quantity, unit_price };
    })
);
```

---

## Goal

Build a fully automated AI-assisted performance engineering pipeline:

1. **Data** — Use Claude Code + MCP to query live databases and generate realistic parameterised test data (no manual SQL or CSV prep)
2. **Scripts** — Use Claude Code to write and iterate k6 load test scripts and Playwright browser scripts
3. **Execution** — Run tests against the local Docker stack (and later staging/production)
4. **Analysis** — Use Claude Code to interpret k6 results, identify bottlenecks, and suggest fixes
5. **Reporting** — Auto-generate performance reports from test output

**Tools:** k6 (load testing) · Playwright (browser/E2E testing) · Claude Code + MCP (AI assistance) · Docker (target stack)

---

## Week by Week Plan

### Week 1 — Foundation
Set up the target application, MCP connections, and understand the data model.
- Deploy 3-service e-commerce stack with Docker Compose
- Connect Claude Code to all three databases via MCP
- Explore schemas, row counts, and data relationships
- Generate first test data CSV via AI-assisted cross-database query

### Week 2 — k6 Load Testing
Build parameterised k6 scripts for the core user journeys.
- Browse products (GET /api/products)
- User login / profile lookup (GET /api/users/{id})
- Checkout flow (POST /api/orders with real customer + product data)
- Run baseline load tests and capture p95/p99 latencies

### Week 3 — Playwright Browser Testing
Add browser-level performance testing via the React SPA.
- Write Playwright scripts for key user journeys
- Measure Core Web Vitals (LCP, CLS, TBT)
- Integrate with k6 browser module

### Week 4 — AI-Assisted Analysis & Reporting
Close the loop with automated analysis.
- Feed k6 JSON results back to Claude Code for interpretation
- Identify slow endpoints, error patterns, and database bottlenecks
- Auto-generate a performance summary report
- Suggest and implement optimisations (indexes, query changes, caching)

---

## Completed So Far

### Infrastructure
- [x] 3-service e-commerce Docker Compose stack (user, product, order services)
- [x] Nginx API gateway routing all three services at `:80`
- [x] React SPA frontend at `:3000`
- [x] PostgreSQL databases seeded: 10K users, 5K products, 50K orders

### MCP Integration
- [x] `user-db` MCP connection (PostgreSQL on :5433)
- [x] `product-db` MCP connection (PostgreSQL on :5434)
- [x] `order-db` MCP connection (PostgreSQL on :5435)
- [x] Cross-database queries working via Claude Code

### Bug Fixes
- [x] Fixed login 422 error — added email filter to user service query
- [x] Fixed order service user filtering

### Test Data
- [x] `test-data/test-data-checkout.csv` — 500 customers with recent orders, joined across all 3 databases, ready for k6 parameterisation

### Kubernetes (AKS) Deployment
- [x] Full AKS deployment — cluster `aks-perf-demo`, namespace `perf-demo`, region `northeurope`
- [x] All services running: user-service, product-service, order-service, frontend + 3 PostgreSQL DBs
- [x] Nginx ingress controller — single public IP `20.82.174.115` for all routes
- [x] Frontend live at `http://20.82.174.115`
- [x] AKS MCP connections: `user-db-aks` (:15433), `product-db-aks` (:15434), `order-db-aks` (:15435) via kubectl port-forward
- [x] AKS databases seeded: 10K users, 5K products, 50K orders

### k6 Load Testing
- [x] `k6/config/config.js` — environment switcher (`TARGET_ENV=local` or `aks`, defaults to AKS `http://20.82.174.115`)
- [x] `k6/config/grafana-config.js` — Grafana Cloud Prometheus remote write settings
- [x] `k6/scripts/baseline-test.js` — 10 VUs, 5 min, 4 transaction groups with custom trends
- [x] `k6/scripts/stress-test.js` — stepped ramp 10→25→50→100 VUs
- [x] `k6/scripts/peak-load-test.js` — ramp to 50 VUs, hold, ramp down
- [x] `k6/scripts/realistic-load-test.js` — 4 weighted scenarios (browse/cart/checkout/history)
- [x] `k6/scripts/generate-test-data.js` — Node.js script to regenerate CSV from any env
- [x] `k6/data/test-data-checkout.csv` — 500 rows regenerated from AKS databases
- [x] Grafana Cloud integration working — metrics streaming via Prometheus remote write
- [x] Baseline test result: p(95)=52ms, 0% errors, 7.74 req/s at 10 VUs over 5 min

---

## AKS Deployment

### Cluster Details
| Property | Value |
|---|---|
| Cluster | `aks-perf-demo` |
| Resource Group | `rg-perf-demo` |
| Region | `northeurope` |
| Namespace | `perf-demo` |
| Node Architecture | **ARM64** (Ampere-based VM SKU) |
| ACR | `pavaniperfdemo.azurecr.io` |

### Live URLs
| Route | Service |
|---|---|
| `http://20.82.174.115` | React SPA (frontend) |
| `http://20.82.174.115/api/users` | User service |
| `http://20.82.174.115/api/products` | Product service |
| `http://20.82.174.115/api/orders` | Order service |

### k8s Directory Structure
```
k8s/
├── namespace.yaml
├── secrets.yaml                  # db-secrets with PostgreSQL connection URLs
├── postgres/
│   ├── user-db.yaml              # PVC + Deployment + ClusterIP Service
│   ├── product-db.yaml
│   └── order-db.yaml
├── user-service/
│   ├── deployment.yaml
│   └── service.yaml              # ClusterIP (ingress handles external access)
├── product-service/
│   ├── deployment.yaml
│   └── service.yaml
├── order-service/
│   ├── deployment.yaml
│   └── service.yaml
├── frontend/
│   ├── deployment.yaml
│   └── service.yaml
├── ingress/
│   └── ingress.yaml              # Nginx ingress — 4 separate Ingress objects
├── deploy.sh                     # Full deploy script with rollout waits
└── build-and-push.sh             # Build & push all images (ARM64)
```

### Deploying to AKS

**Step 1 — Build and push images (from WSL2, must be ARM64):**
```bash
./k8s/build-and-push.sh
```

**Step 2 — Deploy:**
```bash
az aks get-credentials --resource-group rg-perf-demo --name aks-perf-demo
./k8s/deploy.sh
```

**Nginx ingress controller** (installed once, not in deploy.sh):
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/cloud/deploy.yaml
```

### Critical Lessons Learned

**1. AKS node pool is ARM64**
The VM SKU is Ampere/ARM-based. All images MUST be built for `linux/arm64`.
Always use: `--platform linux/arm64`

**2. Build images from WSL2, not Windows PowerShell**
Docker Desktop on Windows creates OCI manifest indexes that AKS containerd cannot parse.
Build from WSL2 with `--provenance=false` to get a clean single-arch manifest:
```bash
docker build --platform linux/arm64 --no-cache --provenance=false \
  -t pavaniperfdemo.azurecr.io/<service>:latest ./<service>
```

**3. ACR must be attached to AKS**
Run once after cluster creation:
```bash
az aks update --name aks-perf-demo --resource-group rg-perf-demo --attach-acr pavaniperfdemo
```

**4. PostgreSQL PGDATA on Azure Disk PVCs**
Azure Disk PVCs have a `lost+found` directory at the mount root. PostgreSQL `initdb`
fails if `PGDATA` points directly at the mount. All postgres deployments set:
```yaml
- name: PGDATA
  value: /var/lib/postgresql/data/pgdata
```

**5. Windows CRLF in shell scripts**
Git on Windows converts LF→CRLF on checkout. Shell scripts baked into Docker images
get `exec format error` on Linux. Fixed by:
- `.gitattributes` enforcing `eol=lf` for all `.sh`, `.py`, `Dockerfile` files
- Inlining CMD in Dockerfiles instead of calling `start.sh`

**6. Azure public IP quota**
Free/trial subscriptions have a limit on public IPs. Use a single Nginx ingress
controller instead of `LoadBalancer` type per service. All services use `ClusterIP`.

**7. ACR Tasks not available on Basic tier**
`az acr build` requires Standard or Premium ACR tier. Use WSL2 builds instead.

## k6 Load Testing

### Directory Structure
```
k6/
├── config/
│   ├── config.js           # BASE URL switcher — TARGET_ENV=local|aks (default: aks)
│   └── grafana-config.js   # Grafana Cloud / Prometheus remote write settings
├── data/
│   └── test-data-checkout.csv   # 500 rows from AKS DBs (regenerate with generate-test-data.js)
├── scripts/
│   ├── baseline-test.js         # 10 VUs, 5 min steady state — establishes baseline
│   ├── stress-test.js           # Stepped ramp 10→25→50→100 VUs — find breaking point
│   ├── peak-load-test.js        # Ramp to 50 VUs, hold 5 min — peak traffic model
│   ├── realistic-load-test.js   # 4 weighted scenarios (browse/cart/checkout/history)
│   ├── 01-hello-k6.js           # Intro smoke test
│   ├── run-all-tests.js         # Orchestrator: node k6/scripts/run-all-tests.js
│   └── generate-test-data.js    # Regenerate CSV: node k6/scripts/generate-test-data.js [local|aks]
└── results/
    └── *.html / *.json          # Auto-generated HTML reports + raw JSON
```

### Running Tests

**Step 1 — Load credentials (once per shell session):**
```bash
set -a && source <(tr -d '\r' < .env) && set +a
```

**Step 2 — Start AKS port-forwards (if using AKS MCP servers):**
```bash
kubectl port-forward -n perf-demo svc/user-db 15433:5432 &
kubectl port-forward -n perf-demo svc/product-db 15434:5432 &
kubectl port-forward -n perf-demo svc/order-db 15435:5432 &
```

**Step 3 — Run a test:**
```bash
# With Grafana output (recommended)
k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js
k6 run --out experimental-prometheus-rw k6/scripts/stress-test.js
k6 run --out experimental-prometheus-rw k6/scripts/peak-load-test.js
k6 run --out experimental-prometheus-rw k6/scripts/realistic-load-test.js

# Quick smoke test (no Grafana)
k6 run --vus 2 --duration 30s k6/scripts/baseline-test.js

# Target local Docker stack instead of AKS
TARGET_ENV=local k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js
```

### Grafana Cloud
| Setting | Value |
|---|---|
| Stack URL | `https://myperformanceproject.grafana.net` |
| Prometheus endpoint | `https://prometheus-prod-39-prod-eu-north-0.grafana.net/api/prom/push` |
| Username | `2997542` |
| Password | stored in `.env` as `K6_PROMETHEUS_RW_PASSWORD` |

### Baseline Performance Results (AKS, 2026-03-06)
| Transaction | Avg | p(90) | p(95) | Threshold |
|---|---|---|---|---|
| Login Page | 42.84ms | 48ms | 52ms | <1500ms ✅ |
| Products Page | 40.28ms | 44ms | 47ms | <1500ms ✅ |
| Product Detail | 36.72ms | 40ms | 42ms | <1500ms ✅ |
| Checkout | 47.48ms | 53ms | 56ms | <1500ms ✅ |
| **Overall** | **41.62ms** | **49ms** | **52ms** | **<1500ms ✅** |

Load: 10 VUs · 5 min · 590 iterations · 2,360 requests · 7.74 req/s · 0% errors
