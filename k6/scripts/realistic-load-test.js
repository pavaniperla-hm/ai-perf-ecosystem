import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { PROMETHEUS_RW_URL, PROMETHEUS_USERNAME } from '../config/grafana-config.js';
import { BASE } from '../config/config.js';

// ── Shared test data ──────────────────────────────────────────────────────────
// Loaded once, shared across all VUs and all scenarios.
const customers = new SharedArray('customers', () =>
  open('../data/test-data-checkout.csv')
    .split('\n').slice(1).filter(Boolean)
    .map(line => {
      const [
        customer_id, customer_email, customer_name, customer_joined,
        order_id, order_date, order_status,
        product_id, product_name, product_category,
        quantity, unit_price, total_price,
      ] = line.split(',');
      return {
        customer_id:   parseInt(customer_id),
        customer_email,
        product_id:    parseInt(product_id),
        quantity:      parseInt(quantity),
        unit_price:    parseFloat(unit_price),
        total_price:   parseFloat(total_price),
      };
    })
);

// ── Custom metrics ────────────────────────────────────────────────────────────
// Per-scenario error rates — lets thresholds be set independently per journey.
const errBrowse   = new Rate('errors_browse');
const errCart     = new Rate('errors_cart');
const errCheckout = new Rate('errors_checkout');
const errHistory  = new Rate('errors_history');

// Per-transaction response time trends — shared across scenarios that hit the
// same endpoint so we get the aggregate picture in one place.
const trendProductsList  = new Trend('txn_products_list',   true);
const trendProductDetail = new Trend('txn_product_detail',  true);
const trendUserLogin     = new Trend('txn_user_login',      true);
const trendCreateOrder   = new Trend('txn_create_order',    true);
const trendOrderHistory  = new Trend('txn_order_history',   true);

// ── Options ───────────────────────────────────────────────────────────────────
// Each scenario uses ramping-vus with a baseline→peak shape:
//   0 → baseline (2 min ramp) → hold 3 min → peak (2 min ramp) → hold 5 min → 0 (1 min)
//
// Baseline distribution (10 VUs total):  browse=6  cart=2  checkout=1  history=1
// Peak distribution    (20 VUs total):   browse=12 cart=5  checkout=2  history=1
export const options = {
  scenarios: {

    // ── 60% of load — casual browsers, no login ───────────────────────────
    browse_products: {
      executor:    'ramping-vus',
      exec:        'browseProducts',
      stages: [
        { duration: '2m', target: 6  },   // ramp to baseline
        { duration: '3m', target: 6  },   // hold baseline
        { duration: '2m', target: 12 },   // ramp to peak
        { duration: '5m', target: 12 },   // hold peak
        { duration: '1m', target: 0  },   // ramp down
      ],
    },

    // ── 25% of load — window shoppers (login → browse → abandon) ─────────
    add_to_cart: {
      executor:    'ramping-vus',
      exec:        'addToCart',
      stages: [
        { duration: '2m', target: 2  },
        { duration: '3m', target: 2  },
        { duration: '2m', target: 5 },
        { duration: '5m', target: 5 },
        { duration: '1m', target: 0 },
      ],
    },

    // ── 10% of load — buyers who complete checkout (most critical journey) ─
    full_checkout: {
      executor:    'ramping-vus',
      exec:        'fullCheckout',
      stages: [
        { duration: '2m', target: 1 },
        { duration: '3m', target: 1 },
        { duration: '2m', target: 2 },
        { duration: '5m', target: 2 },
        { duration: '1m', target: 0 },
      ],
    },

    // ── 5% of load — returning customers checking order history ───────────
    order_history: {
      executor:    'ramping-vus',
      exec:        'orderHistory',
      stages: [
        { duration: '2m', target: 1 },
        { duration: '3m', target: 1 },
        { duration: '2m', target: 1 },
        { duration: '5m', target: 1 },
        { duration: '1m', target: 0 },
      ],
    },
  },

  thresholds: {
    // Overall HTTP
    http_req_duration: ['p(95)<2000'],

    // Per-scenario error budgets (tighter for revenue-critical paths)
    errors_browse:   ['rate<0.01'],
    errors_cart:     ['rate<0.02'],
    errors_checkout: ['rate<0.01'],   // strictest — every lost checkout = lost revenue
    errors_history:  ['rate<0.02'],

    // Per-transaction response time gates
    txn_products_list:  ['p(95)<1000'],
    txn_product_detail: ['p(95)<1000'],
    txn_user_login:     ['p(95)<1500'],
    txn_create_order:   ['p(95)<2000'],
    txn_order_history:  ['p(95)<1500'],
  },

  // Tags are attached to every metric sent to Grafana — use them to filter
  // dashboards by test name or type across multiple runs.
  tags: {
    testName: 'realistic-load',
    testType: 'realistic',
  },
};

// BASE is imported from ../config/config.js — set TARGET_ENV=local to target Docker

// ── Helper — pick a customer record deterministically per VU + iteration ─────
// __ITER resets to 0 each time a VU loops, so combining both gives even spread.
function pickCustomer() {
  return customers[(__VU + __ITER * 100) % customers.length];
}

// ── Scenario 1: Browse Products (60%) ─────────────────────────────────────────
// Simulates a casual visitor: list products, click into one, go back.
// No authentication required.
export function browseProducts() {
  // Pick a product_id from our data set to browse into
  const productId = customers[(__VU * __ITER + __VU) % customers.length].product_id || 1;

  group('Browse — Products List', () => {
    const t   = Date.now();
    const res = http.get(`${BASE}/api/products?limit=20`, {
      tags: { scenario: 'browse_products', transaction: 'Products List' },
    });
    trendProductsList.add(Date.now() - t);

    const ok = check(res, {
      'Browse | Products List | 200':      r => r.status === 200,
      'Browse | Products List | has items': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errBrowse.add(!ok);
  });

  sleep(2);   // user scans the product list

  group('Browse — Product Detail', () => {
    const t   = Date.now();
    const res = http.get(`${BASE}/api/products/${productId}`, {
      tags: { scenario: 'browse_products', transaction: 'Product Detail' },
    });
    trendProductDetail.add(Date.now() - t);

    const ok = check(res, {
      'Browse | Product Detail | 200':       r => r.status === 200,
      'Browse | Product Detail | has price': r => {
        try { return JSON.parse(r.body).price !== undefined; } catch { return false; }
      },
    });
    errBrowse.add(!ok);
  });

  sleep(3);   // user reads the product page, then navigates away
}

// ── Scenario 2: Add to Cart / Abandon (25%) ───────────────────────────────────
// Simulates a window shopper: logs in, browses, views a product, then leaves
// without completing the purchase. No checkout POST is made.
export function addToCart() {
  const customer = pickCustomer();

  let loggedIn = false;

  group('Cart — Login', () => {
    const t   = Date.now();
    const res = http.get(
      `${BASE}/api/users?email=${encodeURIComponent(customer.customer_email)}`,
      { tags: { scenario: 'add_to_cart', transaction: 'Login' } }
    );
    trendUserLogin.add(Date.now() - t);

    const ok = check(res, {
      'Cart | Login | 200':          r => r.status === 200,
      'Cart | Login | user returned': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errCart.add(!ok);
    loggedIn = ok;
  });

  if (!loggedIn) { sleep(1); return; }

  sleep(1);

  group('Cart — Products List', () => {
    const t   = Date.now();
    const res = http.get(`${BASE}/api/products?limit=20`, {
      tags: { scenario: 'add_to_cart', transaction: 'Products List' },
    });
    trendProductsList.add(Date.now() - t);

    const ok = check(res, {
      'Cart | Products List | 200':       r => r.status === 200,
      'Cart | Products List | has items': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errCart.add(!ok);
  });

  sleep(2);

  group('Cart — Product Detail', () => {
    const t   = Date.now();
    const res = http.get(`${BASE}/api/products/${customer.product_id}`, {
      tags: { scenario: 'add_to_cart', transaction: 'Product Detail' },
    });
    trendProductDetail.add(Date.now() - t);

    const ok = check(res, {
      'Cart | Product Detail | 200':       r => r.status === 200,
      'Cart | Product Detail | has price': r => {
        try { return JSON.parse(r.body).price !== undefined; } catch { return false; }
      },
    });
    errCart.add(!ok);
  });

  sleep(5);   // user deliberates, then abandons — longer think time than checkout
}

// ── Scenario 3: Full Checkout (10%) ───────────────────────────────────────────
// The most critical and revenue-generating journey.
// Uses real customer + product data from test-data-checkout.csv.
export function fullCheckout() {
  const customer = pickCustomer();

  let loggedIn = false;

  group('Checkout — Login', () => {
    const t   = Date.now();
    const res = http.get(
      `${BASE}/api/users?email=${encodeURIComponent(customer.customer_email)}`,
      { tags: { scenario: 'full_checkout', transaction: 'Login' } }
    );
    trendUserLogin.add(Date.now() - t);

    const ok = check(res, {
      'Checkout | Login | 200':          r => r.status === 200,
      'Checkout | Login | user returned': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errCheckout.add(!ok);
    loggedIn = ok;
  });

  if (!loggedIn) { sleep(1); return; }

  sleep(1);

  group('Checkout — Products List', () => {
    const t   = Date.now();
    const res = http.get(`${BASE}/api/products?limit=20`, {
      tags: { scenario: 'full_checkout', transaction: 'Products List' },
    });
    trendProductsList.add(Date.now() - t);

    const ok = check(res, {
      'Checkout | Products List | 200':       r => r.status === 200,
      'Checkout | Products List | has items': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errCheckout.add(!ok);
  });

  sleep(2);

  group('Checkout — Product Detail', () => {
    const t   = Date.now();
    const res = http.get(`${BASE}/api/products/${customer.product_id}`, {
      tags: { scenario: 'full_checkout', transaction: 'Product Detail' },
    });
    trendProductDetail.add(Date.now() - t);

    const ok = check(res, {
      'Checkout | Product Detail | 200':       r => r.status === 200,
      'Checkout | Product Detail | has price': r => {
        try { return JSON.parse(r.body).price !== undefined; } catch { return false; }
      },
    });
    errCheckout.add(!ok);
  });

  sleep(1);

  group('Checkout — Place Order', () => {
    const payload = JSON.stringify({
      user_id:     customer.customer_id,
      product_id:  customer.product_id,
      quantity:    customer.quantity,
      unit_price:  customer.unit_price,
      total_price: customer.total_price,
      status:      'pending',
    });

    const t   = Date.now();
    const res = http.post(`${BASE}/api/orders`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags:    { scenario: 'full_checkout', transaction: 'Place Order' },
    });
    trendCreateOrder.add(Date.now() - t);

    const ok = check(res, {
      'Checkout | Place Order | 201':         r => r.status === 201,
      'Checkout | Place Order | order created': r => {
        try { return JSON.parse(r.body).id !== undefined; } catch { return false; }
      },
    });
    errCheckout.add(!ok);
  });

  sleep(1);
}

// ── Scenario 4: Order History (5%) ────────────────────────────────────────────
// Simulates a returning customer checking their past orders.
export function orderHistory() {
  const customer = pickCustomer();

  let loggedIn = false;

  group('History — Login', () => {
    const t   = Date.now();
    const res = http.get(
      `${BASE}/api/users?email=${encodeURIComponent(customer.customer_email)}`,
      { tags: { scenario: 'order_history', transaction: 'Login' } }
    );
    trendUserLogin.add(Date.now() - t);

    const ok = check(res, {
      'History | Login | 200':          r => r.status === 200,
      'History | Login | user returned': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errHistory.add(!ok);
    loggedIn = ok;
  });

  if (!loggedIn) { sleep(1); return; }

  sleep(1);

  group('History — Order List', () => {
    const t   = Date.now();
    const res = http.get(
      `${BASE}/api/orders?user_id=${customer.customer_id}&limit=10`,
      { tags: { scenario: 'order_history', transaction: 'Order History' } }
    );
    trendOrderHistory.add(Date.now() - t);

    const ok = check(res, {
      'History | Order List | 200':        r => r.status === 200,
      'History | Order List | is array':   r => {
        try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
      },
    });
    errHistory.add(!ok);
  });

  sleep(3);   // user reads through their order history
}

// ── Report ────────────────────────────────────────────────────────────────────
function buildReport(data) {
  const m = name => (data.metrics[name] ? data.metrics[name].values : {});

  const fmt   = v => v == null ? 'N/A' : `${Math.round(v)} ms`;
  const pct   = v => v == null ? '0.00' : (v * 100).toFixed(2);
  const round = v => v == null ? 0 : Math.round(v);

  // ── Transaction rows ───────────────────────────────────────────────────────
  const transactions = [
    { label: 'Products List',  metric: 'txn_products_list',  threshold: 1000 },
    { label: 'Product Detail', metric: 'txn_product_detail', threshold: 1000 },
    { label: 'User Login',     metric: 'txn_user_login',     threshold: 1500 },
    { label: 'Place Order',    metric: 'txn_create_order',   threshold: 2000 },
    { label: 'Order History',  metric: 'txn_order_history',  threshold: 1500 },
  ];

  const badge = (p95, thr) =>
    (p95 != null && p95 < thr)
      ? `<span class="badge pass">PASSED</span>`
      : `<span class="badge fail">FAILED</span>`;

  const txnRows = transactions.map(({ label, metric, threshold }) => {
    const v = m(metric);
    return `
    <tr>
      <td class="txn-name">${label}</td>
      <td>${fmt(v.avg)}</td>
      <td>${fmt(v.min)}</td>
      <td>${fmt(v.max)}</td>
      <td>${fmt(v.med)}</td>
      <td>${fmt(v['p(90)'])}</td>
      <td>${fmt(v['p(95)'])}</td>
      <td class="center">${badge(v['p(95)'], threshold)}</td>
    </tr>`;
  }).join('');

  // ── Scenario error rows ────────────────────────────────────────────────────
  const scenarios = [
    { label: 'Browse Products', metric: 'errors_browse',   weight: '60%', baseline: '6',  peak: '12', threshold: 0.01 },
    { label: 'Add to Cart',     metric: 'errors_cart',     weight: '25%', baseline: '2',  peak: '5',  threshold: 0.02 },
    { label: 'Full Checkout',   metric: 'errors_checkout', weight: '10%', baseline: '1',  peak: '2',  threshold: 0.01 },
    { label: 'Order History',   metric: 'errors_history',  weight: '5%',  baseline: '1',  peak: '1',  threshold: 0.02 },
  ];

  const scenarioRows = scenarios.map(({ label, metric, weight, baseline, peak, threshold }) => {
    const v      = m(metric);
    const rate   = v.rate != null ? v.rate : null;
    const passed = rate != null && rate < threshold;
    return `
    <tr>
      <td class="txn-name">${label}</td>
      <td class="center">${weight}</td>
      <td class="center">${baseline} → ${peak}</td>
      <td class="center">${rate != null ? (rate * 100).toFixed(2) + '%' : 'N/A'}</td>
      <td class="center">${(threshold * 100).toFixed(0)}%</td>
      <td class="center">${badge(rate, threshold)}</td>
    </tr>`;
  }).join('');

  // ── Overall KPIs ───────────────────────────────────────────────────────────
  const checks    = m('checks');
  const dur       = m('http_req_duration');
  const reqs      = m('http_reqs');
  const passed    = checks.passes  || 0;
  const failed    = checks.fails   || 0;
  const total     = passed + failed;
  const passRate  = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';

  // ── Chart data ─────────────────────────────────────────────────────────────
  const txnLabels  = transactions.map(t => t.label);
  const avgData    = transactions.map(t => round(m(t.metric).avg));
  const p90Data    = transactions.map(t => round(m(t.metric)['p(90)']));
  const p95Data    = transactions.map(t => round(m(t.metric)['p(95)']));
  const minData    = transactions.map(t => round(m(t.metric).min));
  const maxData    = transactions.map(t => round(m(t.metric).max));

  const scenarioLabels  = scenarios.map(s => s.label);
  const scenarioWeights = [60, 25, 10, 5];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Realistic Load Test — Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           margin: 0; background: #f1f5f9; color: #1e293b; }
    .header { background: linear-gradient(135deg,#1e1b4b,#4f46e5);
              color:#fff; padding:32px 40px; }
    .header h1 { margin:0 0 4px; font-size:1.8rem; }
    .header p  { margin:0; opacity:.75; font-size:.9rem; }
    .scenario-badge { display:inline-block; background:rgba(255,255,255,.2);
                      border-radius:99px; padding:3px 12px; font-size:.8rem;
                      font-weight:700; margin-bottom:10px; letter-spacing:.05em; }
    .content    { max-width:1280px; margin:32px auto; padding:0 24px; }
    .card       { background:#fff; border-radius:12px;
                  box-shadow:0 1px 4px rgba(0,0,0,.08); margin-bottom:28px; overflow:hidden; }
    .card-title { padding:16px 20px; font-size:1rem; font-weight:700; color:#0f172a;
                  border-bottom:1px solid #e2e8f0; }
    .kpi-grid   { display:grid; grid-template-columns:repeat(4,1fr); gap:0; }
    .kpi        { padding:20px 24px; border-right:1px solid #e2e8f0; }
    .kpi:last-child { border-right:none; }
    .kpi-label  { font-size:.72rem; color:#64748b; text-transform:uppercase;
                  letter-spacing:.06em; margin-bottom:6px; }
    .kpi-value  { font-size:1.6rem; font-weight:700; color:#0f172a; line-height:1; }
    .kpi-sub    { font-size:.75rem; color:#94a3b8; margin-top:4px; }
    /* Scenario allocation cards */
    .scenario-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0; }
    .scenario-card { padding:18px 20px; border-right:1px solid #e2e8f0; }
    .scenario-card:last-child { border-right:none; }
    .sc-name   { font-size:.8rem; font-weight:700; color:#0f172a; margin-bottom:4px; }
    .sc-weight { font-size:2rem; font-weight:800; line-height:1; margin-bottom:4px; }
    .sc-vus    { font-size:.75rem; color:#64748b; }
    .sc-bar    { height:6px; border-radius:3px; margin-top:10px; }
    .charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-bottom:28px; }
    .chart-wrap  { padding:20px; }
    .chart-wrap canvas { max-height:280px; }
    table      { width:100%; border-collapse:collapse; }
    thead th   { background:#f8fafc; padding:10px 16px; text-align:right;
                 font-size:.75rem; text-transform:uppercase; letter-spacing:.05em;
                 color:#475569; font-weight:600; border-bottom:2px solid #e2e8f0; }
    thead th:first-child { text-align:left; }
    thead th.center { text-align:center; }
    tbody td   { padding:11px 16px; text-align:right; border-bottom:1px solid #f1f5f9;
                 font-size:.9rem; }
    tbody tr:last-child td { border-bottom:none; }
    tbody tr:hover { background:#f8fafc; }
    .txn-name  { text-align:left; font-weight:600; color:#1e1b4b; }
    .center    { text-align:center; }
    .badge     { display:inline-block; padding:2px 10px; border-radius:99px;
                 font-size:.75rem; font-weight:700; }
    .badge.pass { background:#dcfce7; color:#16a34a; }
    .badge.fail { background:#fee2e2; color:#dc2626; }
    .legend-pill { display:inline-block; width:10px; height:10px;
                   border-radius:50%; margin-right:5px; vertical-align:middle; }
  </style>
</head>
<body>
  <div class="header">
    <div class="scenario-badge">REALISTIC LOAD — 4 WEIGHTED SCENARIOS</div>
    <h1>Realistic Load Test — Performance Report</h1>
    <p>Baseline: 10 VUs &nbsp;·&nbsp; Peak: 20 VUs &nbsp;·&nbsp; Duration: 13 min &nbsp;·&nbsp; Generated ${new Date().toUTCString()}</p>
  </div>
  <div class="content">

    <!-- Scenario allocation -->
    <div class="card">
      <div class="card-title">Scenario Allocation</div>
      <div class="scenario-grid">
        <div class="scenario-card">
          <div class="sc-name">Browse Products</div>
          <div class="sc-weight" style="color:#4f46e5">60%</div>
          <div class="sc-vus">6 baseline &rarr; 12 peak VUs</div>
          <div class="sc-bar" style="background:#4f46e5;width:60%"></div>
        </div>
        <div class="scenario-card">
          <div class="sc-name">Add to Cart</div>
          <div class="sc-weight" style="color:#0ea5e9">25%</div>
          <div class="sc-vus">2 baseline &rarr; 5 peak VUs</div>
          <div class="sc-bar" style="background:#0ea5e9;width:25%"></div>
        </div>
        <div class="scenario-card">
          <div class="sc-name">Full Checkout</div>
          <div class="sc-weight" style="color:#16a34a">10%</div>
          <div class="sc-vus">1 baseline &rarr; 2 peak VUs</div>
          <div class="sc-bar" style="background:#16a34a;width:10%"></div>
        </div>
        <div class="scenario-card">
          <div class="sc-name">Order History</div>
          <div class="sc-weight" style="color:#d97706">5%</div>
          <div class="sc-vus">1 baseline &rarr; 1 peak VUs</div>
          <div class="sc-bar" style="background:#d97706;width:5%"></div>
        </div>
      </div>
    </div>

    <!-- Overall KPIs -->
    <div class="card">
      <div class="card-title">Overall Summary</div>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Total Requests</div>
          <div class="kpi-value">${reqs.count || 0}</div>
          <div class="kpi-sub">${reqs.rate ? reqs.rate.toFixed(2) : 0} req/s</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Avg Response Time</div>
          <div class="kpi-value">${fmt(dur.avg)}</div>
          <div class="kpi-sub">p(95) = ${fmt(dur['p(95)'])}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Check Pass Rate</div>
          <div class="kpi-value">${passRate}%</div>
          <div class="kpi-sub">${passed} passed / ${failed} failed</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Peak VUs</div>
          <div class="kpi-value">20</div>
          <div class="kpi-sub">across 4 weighted scenarios</div>
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div class="charts-grid">
      <div class="card">
        <div class="card-title">Avg / p(90) / p(95) — by Transaction</div>
        <div class="chart-wrap"><canvas id="chartPercentiles"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Scenario Load Distribution</div>
        <div class="chart-wrap"><canvas id="chartScenarios"></canvas></div>
      </div>
    </div>

    <!-- Per-transaction response times -->
    <div class="card">
      <div class="card-title">Transaction Response Times (aggregated across all scenarios)</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left">Transaction</th>
            <th>Avg</th><th>Min</th><th>Max</th>
            <th>Median</th><th>p(90)</th><th>p(95)</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody>${txnRows}</tbody>
      </table>
    </div>

    <!-- Per-scenario error summary -->
    <div class="card">
      <div class="card-title">Scenario Error Summary</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left">Scenario</th>
            <th class="center">Load Weight</th>
            <th class="center">VUs (baseline → peak)</th>
            <th class="center">Error Rate</th>
            <th class="center">Threshold</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>
    </div>

  </div>

  <script>
    const txnLabels = ${JSON.stringify(txnLabels)};
    const avgData   = ${JSON.stringify(avgData)};
    const p90Data   = ${JSON.stringify(p90Data)};
    const p95Data   = ${JSON.stringify(p95Data)};
    const minData   = ${JSON.stringify(minData)};
    const maxData   = ${JSON.stringify(maxData)};

    const scenarioLabels  = ${JSON.stringify(scenarioLabels)};
    const scenarioWeights = ${JSON.stringify(scenarioWeights)};

    new Chart(document.getElementById('chartPercentiles'), {
      type: 'bar',
      data: {
        labels: txnLabels,
        datasets: [
          { label: 'Avg',   data: avgData, backgroundColor: 'rgba(79,70,229,.7)'  },
          { label: 'p(90)', data: p90Data, backgroundColor: 'rgba(234,179,8,.7)'  },
          { label: 'p(95)', data: p95Data, backgroundColor: 'rgba(220,38,38,.7)'  },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } }
      }
    });

    new Chart(document.getElementById('chartScenarios'), {
      type: 'doughnut',
      data: {
        labels: scenarioLabels,
        datasets: [{
          data: scenarioWeights,
          backgroundColor: [
            'rgba(79,70,229,.8)',
            'rgba(14,165,233,.8)',
            'rgba(22,163,74,.8)',
            'rgba(217,119,6,.8)',
          ],
          borderWidth: 2,
          borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed + '% of load' }
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

export function handleSummary(data) {
  return {
    'k6/results/realistic-load-results.json': JSON.stringify(data, null, 2),
    'k6/results/realistic-load-report.html':  buildReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
