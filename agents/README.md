# AI Performance Regression Pipeline — Agent Architecture

This directory defines the multi-agent system that automates the full performance
regression lifecycle: from live database extraction through test execution, log
correlation, and Jira reporting — with minimal human intervention.

---

## Architecture Overview

```
  User / CI trigger
        │
        │  "checkout regression"
        ▼
  ┌─────────────────────────────────────────────────────┐
  │                   ORCHESTRATOR                       │
  │  Coordinates all agents. Stops pipeline on failure.  │
  └──────┬──────────────────────────────────────────────┘
         │
         │ scenario, row_target
         ▼
  ┌──────────────┐
  │  DATA AGENT  │  Queries 3 PostgreSQL databases via MCP.
  │              │  Validates and writes parameterised CSV.
  └──────┬───────┘
         │
         │ file_path, row_count, validation_summary
         ▼
  ┌──────────────────┐
  │ EXECUTION AGENT  │  Runs k6 with Prometheus remote write.
  │                  │  Records exact start/end timestamps.
  │                  │  Parses JSON summary → metrics object.
  └──────┬───────────┘
         │
         │ metrics_summary, start_time, end_time, results_file
         ▼
  ┌────────────────┐
  │ ANALYSIS AGENT │  Checks 3 thresholds against metrics.
  │                │  Queries Loki for the exact test window.
  │                │  Correlates slow transactions with log errors.
  │                │  Returns: verdict (PASS|FAIL) + evidence.
  └──────┬─────────┘
         │
         │ verdict, threshold_results, log_summary, next_steps
         ▼
  ┌──────────────────┐
  │ REPORTING AGENT  │  FAIL → creates High priority Jira Bug (SCRUM)
  │                  │         with metrics + Loki evidence sections.
  │                  │  PASS → prints green summary, no ticket.
  └──────────────────┘
         │
         ▼
  Final pipeline summary printed to user
```

---

## Agent Files

| File | Role | Key tools used |
|---|---|---|
| [`orchestrator.md`](orchestrator.md) | Pipeline coordinator | — |
| [`data-agent.md`](data-agent.md) | Test data extraction | MCP (user-db, product-db, order-db) |
| [`execution-agent.md`](execution-agent.md) | k6 test runner | Bash, k6, Prometheus remote write |
| [`analysis-agent.md`](analysis-agent.md) | Metrics + log correlation | PowerShell, Loki HTTP API |
| [`reporting-agent.md`](reporting-agent.md) | Jira ticket creation | mcp-atlassian |

---

## How to Run the Pipeline

Trigger the full pipeline by telling Claude Code:

```
Run the performance regression pipeline for scenario: "checkout regression"
```

Or with overrides:

```
Run the performance regression pipeline:
  scenario: "checkout regression"
  vus: 20
  duration: 10m
  threshold_p99_ms: 300
```

Claude will act as the Orchestrator, invoking each agent in sequence.

---

## Handoff Data Flow

```
  Orchestrator
      │
      ├─► DATA AGENT receives:
      │     scenario, row_target
      │
      │   DATA AGENT returns:
      │     file_path, row_count, validation_summary, scenario
      │
      ├─► EXECUTION AGENT receives:
      │     file_path, row_count, scenario, vus, duration, threshold_p99_ms
      │
      │   EXECUTION AGENT returns:
      │     metrics_summary, start_time, end_time, results_file, scenario
      │
      ├─► ANALYSIS AGENT receives:
      │     metrics_summary, start_time, end_time, results_file,
      │     scenario, threshold_p99_ms
      │
      │   ANALYSIS AGENT returns:
      │     verdict, threshold_results, log_summary, metrics_summary,
      │     next_steps, scenario, start_time, end_time
      │
      └─► REPORTING AGENT receives:
            (everything from analysis agent output)

          REPORTING AGENT returns:
            ticket_key, ticket_url   ← or "SKIPPED" on PASS
```

---

## Infrastructure Used

### Databases (MCP)
```
user-db    → localhost:5433  (userdb)    — 10,001 users
product-db → localhost:5434  (productdb) — 5,000 products
order-db   → localhost:5435  (orderdb)   — 50,005 orders
```

### Application Under Test (Docker)
```
Nginx API gateway  → localhost:80
  /api/users       → user-service:8001    (Python FastAPI)
  /api/products    → product-service:8002 (Node.js Express)
  /api/orders      → order-service:8003   (Python FastAPI)
```

### Observability (Grafana Cloud)
```
Prometheus remote write  → https://prometheus-prod-39-prod-eu-north-0.grafana.net
Loki log ingest          → https://logs-prod-025.grafana.net  (via Promtail)
Loki log query           → https://logs-prod-025.grafana.net  (Basic auth)
Grafana dashboards       → https://myperformanceproject.grafana.net
```

### Jira (mcp-atlassian)
```
Project : SCRUM  ("AI Perf Ecosystem")
Instance: https://pavani-perf-demo.atlassian.net
Ticket type: Bug / High priority
Labels: performance-regression, automated, <scenario-slug>
```

---

## Default Thresholds

| Threshold | Limit | Notes |
|---|---|---|
| p99 response time | < 500ms | Evaluated via p95 proxy (p95 > 425ms triggers breach) |
| Error rate | < 1% | `http_req_failed` rate |
| Checks success | > 99% | k6 check pass rate |

These can be overridden per run via the `threshold_p99_ms` parameter.

---

## Failure Handling

The Orchestrator stops the pipeline immediately if any agent fails and prints:

```
PIPELINE FAILED at <agent-name>
Reason: <error message>
Action: Fix the issue above and re-run the pipeline
```

### Common failures and fixes

| Agent | Failure | Fix |
|---|---|---|
| Data Agent | `< 10 rows extracted` | Check if orders exist in last 30 days; widen window |
| Data Agent | `MCP connection failed` | Ensure `docker compose up` is running |
| Execution Agent | `k6 not found` | Install k6 to `C:\Program Files\k6\` |
| Execution Agent | `Prometheus 429` | Warning only — test still valid; Grafana free tier rate limit |
| Analysis Agent | `Loki auth error` | Add `logs:read` scope to Grafana access policy token |
| Reporting Agent | `Jira tool error` | Check mcp-atlassian MCP server is running; verify JIRA_API_TOKEN |

---

## Extending the Pipeline

### Adding a new scenario

1. Add a SQL query block to `data-agent.md` for the new scenario keyword
2. Add a script mapping entry to `execution-agent.md`
3. No changes needed to analysis or reporting agents

### Adding a new threshold

1. Add the threshold row to the table in `analysis-agent.md`
2. Add the corresponding row to the Jira template in `reporting-agent.md`
3. Update `orchestrator.md` handoff contract if passing a new parameter

### Adding a new agent

1. Create `agents/<new-agent>.md` following the same Input/Output/Rules pattern
2. Add it to the sequence in `orchestrator.md` with its handoff contract
3. Update this README

---

## k6 Scripts Reference

```
k6/scripts/
├── baseline-test.js         ← default for checkout/login/browse scenarios
├── peak-load-test.js        ← spike to 2× normal VU count
├── stress-test.js           ← ramp until breaking point
├── realistic-load-test.js   ← production traffic shape simulation
├── checkout-load-test.js    ← checkout-specific extended load
└── query-loki.ps1           ← PowerShell Loki query (used by analysis agent)
```

---

## Test Data Reference

```
k6/data/
├── regression-test-data-50.csv   ← 50 customers, last 30 days (example)
└── <scenario>-<timestamp>.csv    ← generated per pipeline run
```
