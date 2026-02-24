#!/usr/bin/env node
/**
 * run-all-tests.js
 * Orchestrator that runs all three k6 test scenarios in sequence.
 *
 * Usage:
 *   node tests/k6/run-all-tests.js
 *   node tests/k6/run-all-tests.js --only baseline
 *   node tests/k6/run-all-tests.js --only peak
 *   node tests/k6/run-all-tests.js --only stress
 *   node tests/k6/run-all-tests.js --skip stress
 *
 * The K6_PATH environment variable overrides the k6 binary location:
 *   K6_PATH="C:\Program Files\k6\k6.exe" node tests/k6/run-all-tests.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

// ── Configuration ─────────────────────────────────────────────────────────────

const K6 = process.env.K6_PATH || 'k6';   // override with K6_PATH env var

const TESTS_DIR   = path.join(__dirname);
const RESULTS_DIR = path.join(__dirname, '..', 'results');

const SCENARIOS = [
  {
    key:    'baseline',
    label:  'Baseline Load Test',
    file:   path.join(TESTS_DIR, 'baseline-test.js'),
    report: path.join(RESULTS_DIR, 'baseline-report.html'),
    color:  '\x1b[32m',   // green
  },
  {
    key:    'peak',
    label:  'Peak Load Test',
    file:   path.join(TESTS_DIR, 'peak-load-test.js'),
    report: path.join(RESULTS_DIR, 'peak-load-report.html'),
    color:  '\x1b[33m',   // yellow
  },
  {
    key:    'stress',
    label:  'Stress Test',
    file:   path.join(TESTS_DIR, 'stress-test.js'),
    report: path.join(RESULTS_DIR, 'stress-report.html'),
    color:  '\x1b[31m',   // red
  },
];

// ── CLI argument parsing ───────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const only   = argValue(args, '--only');
const skip   = argValue(args, '--skip');

function argValue(arr, flag) {
  const idx = arr.indexOf(flag);
  return idx !== -1 ? arr[idx + 1] : null;
}

function shouldRun(scenario) {
  if (only  && scenario.key !== only)  return false;
  if (skip  && scenario.key === skip)  return false;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

function banner(text, color = '') {
  const line = '─'.repeat(60);
  console.log(`\n${color}${BOLD}${line}${RESET}`);
  console.log(`${color}${BOLD}  ${text}${RESET}`);
  console.log(`${color}${BOLD}${line}${RESET}\n`);
}

function log(msg) { console.log(`  ${msg}`); }

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function durationLabel(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Ensure k6/results directory exists ──────────────────────────────────────

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  log(`Created ${RESULTS_DIR}`);
}

// ── Run each scenario ─────────────────────────────────────────────────────────

const selected = SCENARIOS.filter(shouldRun);

if (selected.length === 0) {
  console.error('\n  No matching scenarios found. Check --only / --skip values.\n');
  process.exit(1);
}

const summary = [];
const overallStart = Date.now();

banner('k6 Test Suite — Starting', '\x1b[36m');
log(`Running ${selected.length} of ${SCENARIOS.length} scenario(s)`);
log(`k6 binary: ${K6}`);
log(`Results:   ${RESULTS_DIR}\n`);

for (const scenario of selected) {
  banner(`${scenario.label}`, scenario.color);
  log(`File:    ${scenario.file}`);
  log(`Started: ${timestamp()}`);
  console.log('');

  const t0 = Date.now();

  const result = spawnSync(
    K6,
    ['run', scenario.file],
    {
      stdio: 'inherit',          // stream k6 output directly to terminal
      cwd:   path.join(__dirname, '..', '..'),  // repo root so relative paths work
      env:   process.env,
    }
  );

  const elapsed = Date.now() - t0;
  const passed  = result.status === 0;

  log('');
  log(`Finished: ${timestamp()} (${durationLabel(elapsed)})`);

  if (result.error) {
    log(`\x1b[31mERROR: ${result.error.message}${RESET}`);
    if (result.error.code === 'ENOENT') {
      log(`\x1b[31mCould not find k6 binary at: ${K6}${RESET}`);
      log(`\x1b[33mSet the K6_PATH environment variable to the correct path.${RESET}`);
      log(`\x1b[33mExample: K6_PATH="C:\\Program Files\\k6\\k6.exe" node tests/k6/run-all-tests.js${RESET}`);
    }
    process.exit(1);
  }

  if (passed) {
    log(`\x1b[32m${BOLD}PASSED${RESET} — all thresholds met`);
  } else {
    log(`\x1b[31m${BOLD}FAILED${RESET} — one or more thresholds breached (exit code ${result.status})`);
  }

  if (fs.existsSync(scenario.report)) {
    log(`Report:  ${scenario.report}`);
  }

  summary.push({ ...scenario, passed, elapsed });
}

// ── Final summary ─────────────────────────────────────────────────────────────

banner('Test Suite Summary', '\x1b[36m');

const totalMs    = Date.now() - overallStart;
const allPassed  = summary.every(s => s.passed);

for (const s of summary) {
  const status = s.passed
    ? `\x1b[32m${BOLD}PASSED${RESET}`
    : `\x1b[31m${BOLD}FAILED${RESET}`;
  const dur = DIM + durationLabel(s.elapsed) + RESET;
  console.log(`  ${status}  ${s.color}${s.label}${RESET}  ${dur}`);
}

console.log('');
log(`Total run time: ${durationLabel(totalMs)}`);

if (allPassed) {
  console.log(`\n\x1b[32m${BOLD}  All tests passed.${RESET}\n`);
} else {
  console.log(`\n\x1b[31m${BOLD}  Some tests failed — review thresholds and reports.${RESET}\n`);
  process.exit(1);
}
