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
