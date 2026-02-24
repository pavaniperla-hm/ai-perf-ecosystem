/**
 * grafana-config.js
 * Grafana Cloud connection settings for k6 metrics export.
 *
 * Non-sensitive values are exported as constants below.
 * The API token (K6_PROMETHEUS_RW_PASSWORD) must never be committed —
 * store it in .env and load it as an environment variable before running.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN WITH GRAFANA OUTPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Step 1 — Create your .env (one-time setup):
 *   Copy .env.example → .env and paste your Grafana API token.
 *
 * Step 2 — Set environment variables:
 *
 *   PowerShell (Windows) — paste and run before k6:
 *     $env:K6_PROMETHEUS_RW_SERVER_URL = "https://prometheus-prod-39-prod-eu-north-0.grafana.net/api/prom/push"
 *     $env:K6_PROMETHEUS_RW_USERNAME   = "2997542"
 *     $env:K6_PROMETHEUS_RW_PASSWORD   = "<your Grafana API token>"
 *
 *   Bash (macOS / Linux / WSL):
 *     export $(grep -v '^#' .env | xargs)
 *
 * Step 3 — Run any test with the Grafana output flag:
 *   "C:\Program Files\k6\k6.exe" run --out experimental-prometheus-rw tests/k6/baseline-test.js
 *   "C:\Program Files\k6\k6.exe" run --out experimental-prometheus-rw tests/k6/peak-load-test.js
 *   "C:\Program Files\k6\k6.exe" run --out experimental-prometheus-rw tests/k6/stress-test.js
 *   "C:\Program Files\k6\k6.exe" run --out experimental-prometheus-rw tests/k6/realistic-load-test.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENVIRONMENT VARIABLES REFERENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * K6_PROMETHEUS_RW_SERVER_URL   Prometheus remote write endpoint (see PROMETHEUS_RW_URL below)
 * K6_PROMETHEUS_RW_USERNAME     Prometheus datasource username (see PROMETHEUS_USERNAME below)
 * K6_PROMETHEUS_RW_PASSWORD     Grafana API token — store in .env, never hardcode
 * K6_PROMETHEUS_RW_PUSH_INTERVAL  How often k6 flushes metrics (default: 5s)
 * K6_PROMETHEUS_RW_TREND_STATS    Percentiles to export, e.g. "p(50),p(90),p(95),p(99)"
 */

// ── Grafana Cloud stack ───────────────────────────────────────────────────────
export const GRAFANA_STACK_URL = 'https://myperformanceproject.grafana.net';

// ── Prometheus remote write endpoint ─────────────────────────────────────────
// Set K6_PROMETHEUS_RW_SERVER_URL to this value before running.
export const PROMETHEUS_RW_URL = 'https://prometheus-prod-39-prod-eu-north-0.grafana.net/api/prom/push';

// ── Prometheus datasource username ───────────────────────────────────────────
// Set K6_PROMETHEUS_RW_USERNAME to this value before running.
export const PROMETHEUS_USERNAME = '2997542';
