/**
 * config.js — environment switcher for k6 tests
 *
 * Priority order for BASE URL:
 *   1. K6_BASE_URL env var  (set by sourcing .env / .env.active)
 *   2. TARGET_ENV env var   ("local" or "aks")
 *   3. Default: aks
 *
 * Recommended usage:
 *   # Load active environment then run
 *   set -a && source <(tr -d '\r' < .env.active) && set +a
 *   k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js
 *
 *   # Or switch environment first (Bash):
 *   ./scripts/switch-env.sh aks
 *   set -a && source <(tr -d '\r' < .env) && set +a
 *   k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js
 *
 *   # PowerShell:
 *   .\scripts\switch-env.ps1 -env aks
 *   k6 run --out experimental-prometheus-rw k6/scripts/baseline-test.js
 */

const fallbacks = {
  local: 'http://localhost:80',
  aks:   'http://20.82.174.115',
};

const targetEnv = __ENV.TARGET_ENV || 'aks';
export const BASE = __ENV.K6_BASE_URL || fallbacks[targetEnv] || fallbacks.aks;
