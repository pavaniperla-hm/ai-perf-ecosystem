import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { PROMETHEUS_RW_URL, PROMETHEUS_USERNAME } from '../config/grafana-config.js';
import { BASE } from '../config/config.js';

// ── Shared test data ──────────────────────────────────────────────────────────
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
const errBrowse   = new Rate('errors_browse');
const errCart     = new Rate('errors_cart');
const errCheckout = new Rate('errors_checkout');
const errHistory  = new Rate('errors_history');

const trendProductsList  = new Trend('txn_products_list',   true);
const trendProductDetail = new Trend('txn_product_detail',  true);
const trendUserLogin     = new Trend('txn_user_login',      true);
const trendCreateOrder   = new Trend('txn_create_order',    true);
const trendOrderHistory  = new Trend('txn_order_history',   true);

// ── Options ───────────────────────────────────────────────────────────────────
// Regression test: same 4 weighted scenarios as realistic-load-test, compressed
// to exactly 2 minutes total.
//
// Stage shape (120 s total):
//   0 → 20 s  ramp to baseline VUs
//  20 → 65 s  hold baseline (45 s)
//  65 → 85 s  ramp to peak VUs
//  85 → 120 s hold peak (35 s)
//
// VU distribution mirrors realistic-load-test proportions:
//   baseline  10 VUs:  browse=6  cart=2  checkout=1  history=1
//   peak      20 VUs:  browse=12 cart=5  checkout=2  history=1
//
// Thresholds are intentionally tight (p95<30 ms) — any real-network deployment
// will breach them, ensuring the FAIL → reporting path is always exercised.
export const options = {
  scenarios: {

    // 60% of load
    browse_products: {
      executor: 'ramping-vus',
      exec:     'browseProducts',
      stages: [
        { duration: '20s', target: 6  },
        { duration: '45s', target: 6  },
        { duration: '20s', target: 12 },
        { duration: '35s', target: 12 },
      ],
    },

    // 25% of load
    add_to_cart: {
      executor: 'ramping-vus',
      exec:     'addToCart',
      stages: [
        { duration: '20s', target: 2 },
        { duration: '45s', target: 2 },
        { duration: '20s', target: 5 },
        { duration: '35s', target: 5 },
      ],
    },

    // 10% of load — revenue-critical
    full_checkout: {
      executor: 'ramping-vus',
      exec:     'fullCheckout',
      stages: [
        { duration: '20s', target: 1 },
        { duration: '45s', target: 1 },
        { duration: '20s', target: 2 },
        { duration: '35s', target: 2 },
      ],
    },

    // 5% of load
    order_history: {
      executor: 'ramping-vus',
      exec:     'orderHistory',
      stages: [
        { duration: '20s', target: 1 },
        { duration: '45s', target: 1 },
        { duration: '20s', target: 1 },
        { duration: '35s', target: 1 },
      ],
    },
  },

  thresholds: {
    // Tight regression gates — designed to fail on any real deployment (~50ms AKS)
    http_req_duration:   ['p(95)<30'],    // will breach at ~52ms actual
    errors_browse:       ['rate<0.01'],
    errors_cart:         ['rate<0.02'],
    errors_checkout:     ['rate<0.01'],   // strictest — revenue path
    errors_history:      ['rate<0.02'],
    txn_products_list:   ['p(95)<30'],
    txn_product_detail:  ['p(95)<30'],
    txn_user_login:      ['p(95)<30'],
    txn_create_order:    ['p(95)<60'],
    txn_order_history:   ['p(95)<30'],
  },

  tags: {
    testName: 'regression',
    testType: 'regression',
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────
function pickCustomer() {
  return customers[(__VU + __ITER * 100) % customers.length];
}

// ── Scenario 1: Browse Products (60%) ─────────────────────────────────────────
export function browseProducts() {
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

  sleep(1);

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

  sleep(1);
}

// ── Scenario 2: Add to Cart / Abandon (25%) ───────────────────────────────────
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
      'Cart | Login | 200':           r => r.status === 200,
      'Cart | Login | user returned': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errCart.add(!ok);
    loggedIn = ok;
  });

  if (!loggedIn) { sleep(1); return; }
  sleep(1);

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

  sleep(1);
}

// ── Scenario 3: Full Checkout (10%) ───────────────────────────────────────────
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
      'Checkout | Login | 200':           r => r.status === 200,
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
      'Checkout | Place Order | 201':           r => r.status === 201,
      'Checkout | Place Order | order created': r => {
        try { return JSON.parse(r.body).id !== undefined; } catch { return false; }
      },
    });
    errCheckout.add(!ok);
  });

  sleep(1);
}

// ── Scenario 4: Order History (5%) ────────────────────────────────────────────
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
      'History | Login | 200':           r => r.status === 200,
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
      'History | Order List | 200':      r => r.status === 200,
      'History | Order List | is array': r => {
        try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
      },
    });
    errHistory.add(!ok);
  });

  sleep(1);
}

// ── Report ────────────────────────────────────────────────────────────────────
function buildReport(data) {
  const m     = name => (data.metrics[name] ? data.metrics[name].values : {});
  const fmt   = v => v == null ? 'N/A' : `${Math.round(v)} ms`;
  const round = v => v == null ? 0 : Math.round(v);

  const transactions = [
    { label: 'Products List',  metric: 'txn_products_list',  threshold: 30   },
    { label: 'Product Detail', metric: 'txn_product_detail', threshold: 30   },
    { label: 'User Login',     metric: 'txn_user_login',     threshold: 30   },
    { label: 'Place Order',    metric: 'txn_create_order',   threshold: 60   },
    { label: 'Order History',  metric: 'txn_order_history',  threshold: 30   },
  ];

  const scenarios = [
    { label: 'Browse Products', metric: 'errors_browse',   weight: '60%', baseVUs: 6,  peakVUs: 12, threshold: 0.01 },
    { label: 'Add to Cart',     metric: 'errors_cart',     weight: '25%', baseVUs: 2,  peakVUs: 5,  threshold: 0.02 },
    { label: 'Full Checkout',   metric: 'errors_checkout', weight: '10%', baseVUs: 1,  peakVUs: 2,  threshold: 0.01 },
    { label: 'Order History',   metric: 'errors_history',  weight: '5%',  baseVUs: 1,  peakVUs: 1,  threshold: 0.02 },
  ];

  const badge = (val, thr) =>
    (val != null && val < thr)
      ? `<span class="badge pass">PASSED</span>`
      : `<span class="badge fail">FAILED</span>`;

  const txnRows = transactions.map(({ label, metric, threshold }) => {
    const v = m(metric);
    return `
    <tr>
      <td class="txn-name">${label}</td>
      <td>${fmt(v.avg)}</td><td>${fmt(v.min)}</td><td>${fmt(v.max)}</td>
      <td>${fmt(v.med)}</td><td>${fmt(v['p(90)'])}</td><td>${fmt(v['p(95)'])}</td>
      <td class="center">${badge(v['p(95)'], threshold)}</td>
    </tr>`;
  }).join('');

  const scenarioRows = scenarios.map(({ label, metric, weight, baseVUs, peakVUs, threshold }) => {
    const v    = m(metric);
    const rate = v.rate != null ? v.rate : null;
    return `
    <tr>
      <td class="txn-name">${label}</td>
      <td class="center">${weight}</td>
      <td class="center">${baseVUs} → ${peakVUs}</td>
      <td class="center">${rate != null ? (rate * 100).toFixed(2) + '%' : 'N/A'}</td>
      <td class="center">${(threshold * 100).toFixed(0)}%</td>
      <td class="center">${badge(rate, threshold)}</td>
    </tr>`;
  }).join('');

  const checks   = m('checks');
  const dur      = m('http_req_duration');
  const reqs     = m('http_reqs');
  const passed   = checks.passes || 0;
  const failed   = checks.fails  || 0;
  const total    = passed + failed;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';
  const errRate  = (m('errors_browse').rate || 0) > 0 ||
                   (m('errors_checkout').rate || 0) > 0 ? 'FAIL' : 'PASS';

  // ── Chart data ─────────────────────────────────────────────────────────────
  const txnLabels = transactions.map(t => t.label);
  const avgData   = transactions.map(t => round(m(t.metric).avg));
  const p90Data   = transactions.map(t => round(m(t.metric)['p(90)']));
  const p95Data   = transactions.map(t => round(m(t.metric)['p(95)']));

  // VU load profile — synthetic from known stage schedule (120 s total)
  // time breakpoints: 0s, 20s, 65s, 85s, 120s
  const vuLabels   = ['0s', '20s', '65s', '85s', '120s'];
  const vuTotal    = [0, 10, 10, 20, 20];   // total across all scenarios
  const vuBrowse   = [0, 6,  6,  12, 12];
  const vuCart     = [0, 2,  2,  5,  5];
  const vuCheckout = [0, 1,  1,  2,  2];
  const vuHistory  = [0, 1,  1,  1,  1];

  // Users vs Response time — overlay aggregate p95 on VU profile
  const p95Overall = round(dur['p(95)']);
  const vuVsRtVUs  = [0, 10, 20];
  // Estimate response times at 0, baseline, peak using p95 as peak anchor
  const vuVsRtP95  = [0, Math.round(p95Overall * 0.65), p95Overall];

  const scenarioLabels  = scenarios.map(s => s.label);
  const scenarioWeights = [60, 25, 10, 5];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Regression Test — Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           margin: 0; background: #f1f5f9; color: #1e293b; }
    .header { background: linear-gradient(135deg,#1e1b4b,#4338ca);
              color: #fff; padding: 32px 40px; }
    .header h1 { margin: 0 0 4px; font-size: 1.8rem; }
    .header p  { margin: 0; opacity: .75; font-size: .9rem; }
    .badge-header { display: inline-block; background: rgba(255,255,255,.2);
                    border-radius: 99px; padding: 3px 12px; font-size: .8rem;
                    font-weight: 700; margin-bottom: 10px; letter-spacing: .05em; }
    .content     { max-width: 1280px; margin: 32px auto; padding: 0 24px; }
    .card        { background: #fff; border-radius: 12px;
                   box-shadow: 0 1px 4px rgba(0,0,0,.08); margin-bottom: 28px; overflow: hidden; }
    .card-title  { padding: 16px 20px; font-size: 1rem; font-weight: 700; color: #0f172a;
                   border-bottom: 1px solid #e2e8f0; }
    .kpi-grid    { display: grid; grid-template-columns: repeat(5,1fr); gap: 0; }
    .kpi         { padding: 20px 24px; border-right: 1px solid #e2e8f0; }
    .kpi:last-child { border-right: none; }
    .kpi-label   { font-size: .72rem; color: #64748b; text-transform: uppercase;
                   letter-spacing: .06em; margin-bottom: 6px; }
    .kpi-value   { font-size: 1.5rem; font-weight: 700; color: #0f172a; line-height: 1; }
    .kpi-sub     { font-size: .75rem; color: #94a3b8; margin-top: 4px; }
    .scenario-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 0; }
    .scenario-card { padding: 18px 20px; border-right: 1px solid #e2e8f0; }
    .scenario-card:last-child { border-right: none; }
    .sc-name   { font-size: .8rem; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .sc-weight { font-size: 2rem; font-weight: 800; line-height: 1; margin-bottom: 4px; }
    .sc-vus    { font-size: .75rem; color: #64748b; }
    .sc-bar    { height: 6px; border-radius: 3px; margin-top: 10px; }
    .charts-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 28px; }
    .charts-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 28px; }
    .chart-wrap    { padding: 20px; }
    .chart-wrap canvas { max-height: 260px; }
    table      { width: 100%; border-collapse: collapse; }
    thead th   { background: #f8fafc; padding: 10px 16px; text-align: right;
                 font-size: .75rem; text-transform: uppercase; letter-spacing: .05em;
                 color: #475569; border-bottom: 2px solid #e2e8f0; }
    thead th:first-child { text-align: left; }
    thead th.center { text-align: center; }
    tbody td   { padding: 11px 16px; text-align: right; border-bottom: 1px solid #f1f5f9;
                 font-size: .9rem; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #f8fafc; }
    .txn-name  { text-align: left; font-weight: 600; color: #1e1b4b; }
    .center    { text-align: center; }
    .badge     { display: inline-block; padding: 2px 10px; border-radius: 99px;
                 font-size: .75rem; font-weight: 700; }
    .badge.pass { background: #dcfce7; color: #16a34a; }
    .badge.fail { background: #fee2e2; color: #dc2626; }
    .note      { font-size: .78rem; color: #94a3b8; padding: 0 20px 14px;
                 font-style: italic; }
  </style>
</head>
<body>
  <div class="header">
    <div class="badge-header">REGRESSION — 4 SCENARIOS · 2 MIN · TIGHT THRESHOLDS</div>
    <h1>Regression Test — Performance Report</h1>
    <p>Baseline: 10 VUs &nbsp;·&nbsp; Peak: 20 VUs &nbsp;·&nbsp; Duration: 2 min &nbsp;·&nbsp;
       Threshold: p(95) &lt; 30 ms &nbsp;·&nbsp; Generated ${new Date().toUTCString()}</p>
  </div>
  <div class="content">

    <!-- Scenario allocation -->
    <div class="card">
      <div class="card-title">Scenario Allocation</div>
      <div class="scenario-grid">
        <div class="scenario-card">
          <div class="sc-name">Browse Products</div>
          <div class="sc-weight" style="color:#4338ca">60%</div>
          <div class="sc-vus">6 baseline &rarr; 12 peak VUs</div>
          <div class="sc-bar" style="background:#4338ca;width:60%"></div>
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
          <div class="kpi-sub">p(90) = ${fmt(dur['p(90)'])}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">p(95) Response</div>
          <div class="kpi-value">${fmt(dur['p(95)'])}</div>
          <div class="kpi-sub">threshold &lt; 30 ms</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Check Pass Rate</div>
          <div class="kpi-value">${passRate}%</div>
          <div class="kpi-sub">${passed} passed / ${failed} failed</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Peak Load</div>
          <div class="kpi-value">20 VUs</div>
          <div class="kpi-sub">across 4 scenarios</div>
        </div>
      </div>
    </div>

    <!-- 3-column charts row: VU profile, Users vs Response, Throughput -->
    <div class="charts-grid-3">
      <div class="card">
        <div class="card-title">VU Load Profile (120 s)</div>
        <div class="chart-wrap"><canvas id="chartVuProfile"></canvas></div>
        <div class="note">Stacked by scenario — shows ramp shape over test duration</div>
      </div>
      <div class="card">
        <div class="card-title">Users vs Response Time</div>
        <div class="chart-wrap"><canvas id="chartUsersVsRt"></canvas></div>
        <div class="note">Estimated from aggregate p95 at baseline and peak VU levels</div>
      </div>
      <div class="card">
        <div class="card-title">Throughput &amp; Distribution</div>
        <div class="chart-wrap"><canvas id="chartScenarios"></canvas></div>
        <div class="note">${reqs.rate ? reqs.rate.toFixed(2) : 0} req/s overall throughput</div>
      </div>
    </div>

    <!-- Transaction response times chart -->
    <div class="charts-grid-2">
      <div class="card">
        <div class="card-title">Avg / p(90) / p(95) — by Transaction</div>
        <div class="chart-wrap"><canvas id="chartPercentiles"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Min / Max — by Transaction</div>
        <div class="chart-wrap"><canvas id="chartMinMax"></canvas></div>
      </div>
    </div>

    <!-- Per-transaction response times table -->
    <div class="card">
      <div class="card-title">Transaction Response Times</div>
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
    // VU load profile
    const vuLabels   = ${JSON.stringify(vuLabels)};
    const vuBrowse   = ${JSON.stringify(vuBrowse)};
    const vuCart     = ${JSON.stringify(vuCart)};
    const vuCheckout = ${JSON.stringify(vuCheckout)};
    const vuHistory  = ${JSON.stringify(vuHistory)};

    new Chart(document.getElementById('chartVuProfile'), {
      type: 'line',
      data: {
        labels: vuLabels,
        datasets: [
          { label: 'Browse (60%)',   data: vuBrowse,   fill: true,
            backgroundColor: 'rgba(67,56,202,.25)', borderColor: 'rgba(67,56,202,.9)',
            tension: 0, pointRadius: 4 },
          { label: 'Cart (25%)',     data: vuCart,     fill: true,
            backgroundColor: 'rgba(14,165,233,.25)', borderColor: 'rgba(14,165,233,.9)',
            tension: 0, pointRadius: 4 },
          { label: 'Checkout (10%)',data: vuCheckout, fill: true,
            backgroundColor: 'rgba(22,163,74,.25)', borderColor: 'rgba(22,163,74,.9)',
            tension: 0, pointRadius: 4 },
          { label: 'History (5%)',   data: vuHistory,  fill: true,
            backgroundColor: 'rgba(217,119,6,.25)', borderColor: 'rgba(217,119,6,.9)',
            tension: 0, pointRadius: 4 },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, stacked: true,
               title: { display: true, text: 'Virtual Users' } },
          x: { title: { display: true, text: 'Elapsed Time' } }
        }
      }
    });

    // Users vs Response Time
    const vuVsRtVUs = ${JSON.stringify(vuVsRtVUs)};
    const vuVsRtP95 = ${JSON.stringify(vuVsRtP95)};

    new Chart(document.getElementById('chartUsersVsRt'), {
      type: 'line',
      data: {
        labels: vuVsRtVUs.map(v => v + ' VUs'),
        datasets: [
          { label: 'p(95) Response Time (ms)',
            data: vuVsRtP95,
            borderColor: 'rgba(220,38,38,.9)',
            backgroundColor: 'rgba(220,38,38,.15)',
            fill: true, tension: 0.3, pointRadius: 5,
            yAxisID: 'yRt' },
          { label: 'Threshold (30 ms)',
            data: [30, 30, 30],
            borderColor: 'rgba(234,179,8,.8)',
            borderDash: [6,3], pointRadius: 0,
            yAxisID: 'yRt' },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          yRt: { beginAtZero: true, position: 'left',
                 title: { display: true, text: 'ms' } },
          x:   { title: { display: true, text: 'Active Virtual Users' } }
        }
      }
    });

    // Throughput distribution
    const scenarioLabels  = ${JSON.stringify(scenarioLabels)};
    const scenarioWeights = ${JSON.stringify(scenarioWeights)};

    new Chart(document.getElementById('chartScenarios'), {
      type: 'doughnut',
      data: {
        labels: scenarioLabels,
        datasets: [{
          data: scenarioWeights,
          backgroundColor: [
            'rgba(67,56,202,.8)','rgba(14,165,233,.8)',
            'rgba(22,163,74,.8)','rgba(217,119,6,.8)',
          ],
          borderWidth: 2, borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed + '% of load' } }
        }
      }
    });

    // Per-transaction percentiles
    const txnLabels = ${JSON.stringify(txnLabels)};
    const avgData   = ${JSON.stringify(avgData)};
    const p90Data   = ${JSON.stringify(p90Data)};
    const p95Data   = ${JSON.stringify(p95Data)};
    const minData   = ${JSON.stringify(transactions.map(t => round(m(t.metric).min)))};
    const maxData   = ${JSON.stringify(transactions.map(t => round(m(t.metric).max)))};


    const sharedOpts = {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } }
    };

    new Chart(document.getElementById('chartPercentiles'), {
      type: 'bar',
      data: {
        labels: txnLabels,
        datasets: [
          { label: 'Avg',   data: avgData, backgroundColor: 'rgba(67,56,202,.7)' },
          { label: 'p(90)', data: p90Data, backgroundColor: 'rgba(234,179,8,.7)' },
          { label: 'p(95)', data: p95Data, backgroundColor: 'rgba(220,38,38,.7)' },
        ]
      },
      options: sharedOpts
    });

    new Chart(document.getElementById('chartMinMax'), {
      type: 'bar',
      data: {
        labels: txnLabels,
        datasets: [
          { label: 'Min', data: minData, backgroundColor: 'rgba(22,163,74,.7)' },
          { label: 'Max', data: maxData, backgroundColor: 'rgba(220,38,38,.7)' },
        ]
      },
      options: sharedOpts
    });

  </script>
</body>
</html>`;
}

export function handleSummary(data) {
  return {
    'k6/results/regression-results.json': JSON.stringify(data, null, 2),
    'k6/results/regression-report.html':  buildReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
