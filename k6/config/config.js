/**
 * config.js — environment switcher for k6 tests
 *
 * Default target is AKS. To run against local Docker stack:
 *   PowerShell:  $env:TARGET_ENV = "local"
 *   Bash:        TARGET_ENV=local k6 run ...
 */

const environments = {
  local: { baseUrl: 'http://localhost' },
  aks:   { baseUrl: 'http://20.82.174.115' },
};

const env = (__ENV.TARGET_ENV || 'aks');
export const BASE = environments[env].baseUrl;
