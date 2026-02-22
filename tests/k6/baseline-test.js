import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate    = new Rate('errors');
const loginTrend   = new Trend('txn_login_page',          true);
const browseTrend  = new Trend('txn_products_page',       true);
const productTrend = new Trend('txn_product_detail_page', true);
const orderTrend   = new Trend('txn_checkout_page',       true);

// ── Test data ─────────────────────────────────────────────────────────────────
const customers = new SharedArray('customers', () =>
  open('../../test-data/test-data-checkout.csv')
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

// ── Options ───────────────────────────────────────────────────────────────────
// Baseline: steady 10 VUs for 5 minutes — establishes normal performance baseline.
// Thresholds are strict because load is minimal; any slowness here is real overhead.
export const options = {
  vus:      10,
  duration: '5m',

  thresholds: {
    http_req_duration:       ['p(95)<1500'],   // tighter than peak/stress
    errors:                  ['rate<0.01'],    // near-zero errors expected at baseline

    txn_login_page:          ['p(95)<1500'],
    txn_products_page:       ['p(95)<1500'],
    txn_product_detail_page: ['p(95)<1500'],
    txn_checkout_page:       ['p(95)<1500'],
  },
};

const BASE = 'http://localhost';

// ── Main scenario ─────────────────────────────────────────────────────────────
export default function () {
  const customer = customers[__VU % customers.length];

  group('Login Page', () => {
    const start = Date.now();
    const res = http.get(
      `${BASE}/api/users?email=${encodeURIComponent(customer.customer_email)}`,
      { tags: { transaction: 'Login Page' } }
    );
    loginTrend.add(Date.now() - start);

    const ok = check(res, {
      'Login Page | Status 200':    r => r.status === 200,
      'Login Page | User returned': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errorRate.add(!ok);
    if (!ok) { sleep(1); return; }
  });

  sleep(1);

  group('Products Page', () => {
    const start = Date.now();
    const res = http.get(
      `${BASE}/api/products?limit=20`,
      { tags: { transaction: 'Products Page' } }
    );
    browseTrend.add(Date.now() - start);

    const ok = check(res, {
      'Products Page | Status 200':        r => r.status === 200,
      'Products Page | Products returned': r => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  sleep(2);

  group('Product Detail Page', () => {
    const start = Date.now();
    const res = http.get(
      `${BASE}/api/products/${customer.product_id}`,
      { tags: { transaction: 'Product Detail Page' } }
    );
    productTrend.add(Date.now() - start);

    const ok = check(res, {
      'Product Detail Page | Status 200': r => r.status === 200,
      'Product Detail Page | Has price':  r => {
        try { return JSON.parse(r.body).price !== undefined; } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  sleep(1);

  group('Checkout Page', () => {
    const payload = JSON.stringify({
      user_id:     customer.customer_id,
      product_id:  customer.product_id,
      quantity:    customer.quantity,
      unit_price:  customer.unit_price,
      total_price: customer.total_price,
      status:      'pending',
    });

    const start = Date.now();
    const res = http.post(
      `${BASE}/api/orders`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags:    { transaction: 'Checkout Page' },
      }
    );
    orderTrend.add(Date.now() - start);

    const ok = check(res, {
      'Checkout Page | Status 201':    r => r.status === 201,
      'Checkout Page | Order created': r => {
        try { return JSON.parse(r.body).id !== undefined; } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  sleep(1);
}

// ── Report ────────────────────────────────────────────────────────────────────
function buildReport(data) {
  const transactions = [
    { label: 'Login Page',          metric: 'txn_login_page'          },
    { label: 'Products Page',       metric: 'txn_products_page'       },
    { label: 'Product Detail Page', metric: 'txn_product_detail_page' },
    { label: 'Checkout Page',       metric: 'txn_checkout_page'       },
  ];

  const fmt = v => v == null ? 'N/A' : `${Math.round(v)} ms`;
  const r   = v => v == null ? 0 : Math.round(v);

  const txnValues = transactions.map(({ label, metric }) => {
    const m = data.metrics[metric];
    return { label, v: m ? m.values : {} };
  });

  const statusBadge = (p95, threshold = 1500) =>
    p95 < threshold
      ? `<span class="badge pass">PASSED</span>`
      : `<span class="badge fail">FAILED</span>`;

  const rows = txnValues.map(({ label, v }) => `
    <tr>
      <td class="txn-name">${label}</td>
      <td>${fmt(v.avg)}</td>
      <td>${fmt(v.min)}</td>
      <td>${fmt(v.max)}</td>
      <td>${fmt(v.med)}</td>
      <td>${fmt(v['p(90)'])}</td>
      <td>${fmt(v['p(95)'])}</td>
      <td class="center">${statusBadge(v['p(95)'])}</td>
    </tr>`).join('');

  const checks    = data.metrics.checks           ? data.metrics.checks.values           : {};
  const errMetric = data.metrics.errors            ? data.metrics.errors.values            : {};
  const dur       = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
  const reqs      = data.metrics.http_reqs         ? data.metrics.http_reqs.values         : {};

  const passed   = checks.passes  || 0;
  const failed   = checks.fails   || 0;
  const total    = passed + failed;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';
  const errRate  = errMetric.rate != null ? (errMetric.rate * 100).toFixed(2) : '0.00';

  const labels  = txnValues.map(t => t.label);
  const avgData = txnValues.map(t => r(t.v.avg));
  const minData = txnValues.map(t => r(t.v.min));
  const maxData = txnValues.map(t => r(t.v.max));
  const p90Data = txnValues.map(t => r(t.v['p(90)']));
  const p95Data = txnValues.map(t => r(t.v['p(95)']));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Baseline Test — Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           margin: 0; background: #f1f5f9; color: #1e293b; }
    .header { background: linear-gradient(135deg,#14532d,#16a34a);
              color:#fff; padding:32px 40px; }
    .header h1 { margin:0 0 4px; font-size:1.8rem; }
    .header p  { margin:0; opacity:.75; font-size:.9rem; }
    .scenario-badge { display:inline-block; background:rgba(255,255,255,.2);
                      border-radius:99px; padding:3px 12px; font-size:.8rem;
                      font-weight:700; margin-bottom:10px; letter-spacing:.05em; }
    .content   { max-width:1200px; margin:32px auto; padding:0 24px; }
    .card      { background:#fff; border-radius:12px;
                 box-shadow:0 1px 4px rgba(0,0,0,.08); margin-bottom:28px; overflow:hidden; }
    .card-title { padding:16px 20px; font-size:1rem; font-weight:700; color:#0f172a;
                  border-bottom:1px solid #e2e8f0; background:#fff; }
    .kpi-grid  { display:grid; grid-template-columns:repeat(4,1fr); gap:0; }
    .kpi       { padding:20px 24px; border-right:1px solid #e2e8f0; }
    .kpi:last-child { border-right:none; }
    .kpi-label { font-size:.72rem; color:#64748b; text-transform:uppercase;
                 letter-spacing:.06em; margin-bottom:6px; }
    .kpi-value { font-size:1.6rem; font-weight:700; color:#0f172a; line-height:1; }
    .kpi-sub   { font-size:.75rem; color:#94a3b8; margin-top:4px; }
    .charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-bottom:28px; }
    .chart-wrap  { padding:20px; }
    .chart-wrap canvas { max-height:280px; }
    table      { width:100%; border-collapse:collapse; }
    thead th   { background:#f8fafc; padding:10px 16px; text-align:right;
                 font-size:.75rem; text-transform:uppercase; letter-spacing:.05em;
                 color:#475569; font-weight:600; border-bottom:2px solid #e2e8f0; }
    thead th:first-child { text-align:left; }
    tbody td   { padding:11px 16px; text-align:right; border-bottom:1px solid #f1f5f9;
                 font-size:.9rem; }
    tbody tr:last-child td { border-bottom:none; }
    tbody tr:hover { background:#f8fafc; }
    .txn-name  { text-align:left; font-weight:600; color:#14532d; }
    .center    { text-align:center; }
    .badge     { display:inline-block; padding:2px 10px; border-radius:99px;
                 font-size:.75rem; font-weight:700; }
    .badge.pass { background:#dcfce7; color:#16a34a; }
    .badge.fail { background:#fee2e2; color:#dc2626; }
  </style>
</head>
<body>
  <div class="header">
    <div class="scenario-badge">BASELINE</div>
    <h1>Baseline Load Test — Performance Report</h1>
    <p>10 Virtual Users &nbsp;·&nbsp; 5 minutes &nbsp;·&nbsp; Threshold: p(95) &lt; 1500 ms &nbsp;·&nbsp; Generated ${new Date().toUTCString()}</p>
  </div>
  <div class="content">

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
          <div class="kpi-label">Error Rate</div>
          <div class="kpi-value">${errRate}%</div>
          <div class="kpi-sub">Threshold &lt; 1%</div>
        </div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card">
        <div class="card-title">Avg / p(90) / p(95) Response Time by Transaction</div>
        <div class="chart-wrap"><canvas id="chartPercentiles"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Min / Max Response Time by Transaction</div>
        <div class="chart-wrap"><canvas id="chartMinMax"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Transaction Response Times</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left">Transaction</th>
            <th>Avg</th><th>Min</th><th>Max</th>
            <th>Median</th><th>p(90)</th><th>p(95)</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

  </div>

  <script>
    const labels  = ${JSON.stringify(labels)};
    const avgData = ${JSON.stringify(avgData)};
    const minData = ${JSON.stringify(minData)};
    const maxData = ${JSON.stringify(maxData)};
    const p90Data = ${JSON.stringify(p90Data)};
    const p95Data = ${JSON.stringify(p95Data)};

    const defaults = {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } }
    };

    new Chart(document.getElementById('chartPercentiles'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Avg',   data: avgData, backgroundColor: 'rgba(22,163,74,.7)'  },
          { label: 'p(90)', data: p90Data, backgroundColor: 'rgba(234,179,8,.7)'  },
          { label: 'p(95)', data: p95Data, backgroundColor: 'rgba(220,38,38,.7)'  },
        ]
      },
      options: defaults
    });

    new Chart(document.getElementById('chartMinMax'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Min', data: minData, backgroundColor: 'rgba(22,163,74,.7)'  },
          { label: 'Max', data: maxData, backgroundColor: 'rgba(220,38,38,.7)'  },
        ]
      },
      options: defaults
    });
  </script>
</body>
</html>`;
}

export function handleSummary(data) {
  return {
    'test-results/baseline-results.json': JSON.stringify(data, null, 2),
    'test-results/baseline-report.html':  buildReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
