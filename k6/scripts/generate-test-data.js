/**
 * generate-test-data.js
 * Regenerates k6/data/test-data-checkout.csv from the AKS (or local) databases.
 * Run with: node k6/scripts/generate-test-data.js [local|aks]
 *
 * Requires: npm install pg  (one-time)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const env = process.argv[2] || 'aks';

const config = {
  local: {
    user:    { host: 'localhost', port: 5433, database: 'userdb',    user: 'postgres', password: 'postgres' },
    product: { host: 'localhost', port: 5434, database: 'productdb', user: 'postgres', password: 'postgres' },
    order:   { host: 'localhost', port: 5435, database: 'orderdb',   user: 'postgres', password: 'postgres' },
  },
  aks: {
    user:    { host: 'localhost', port: 15433, database: 'userdb',    user: 'postgres', password: 'postgres' },
    product: { host: 'localhost', port: 15434, database: 'productdb', user: 'postgres', password: 'postgres' },
    order:   { host: 'localhost', port: 15435, database: 'orderdb',   user: 'postgres', password: 'postgres' },
  },
};

const dbConfig = config[env];
if (!dbConfig) { console.error('Usage: node generate-test-data.js [local|aks]'); process.exit(1); }

async function main() {
  console.log(`Generating test data from ${env} databases...`);

  const orderClient   = new Client(dbConfig.order);
  const userClient    = new Client(dbConfig.user);
  const productClient = new Client(dbConfig.product);

  await Promise.all([orderClient.connect(), userClient.connect(), productClient.connect()]);

  // Step 1: Get 500 unique users with their most recent order
  const { rows: orders } = await orderClient.query(`
    SELECT DISTINCT ON (user_id)
      user_id, id AS order_id, product_id, quantity, unit_price, total_price, status, created_at AS order_date
    FROM orders
    ORDER BY user_id, created_at DESC
    LIMIT 500
  `);
  console.log(`  Got ${orders.length} orders`);

  // Step 2: Fetch user details
  const userIds = orders.map(o => o.user_id);
  const { rows: users } = await userClient.query(
    `SELECT id, name, email, created_at FROM users WHERE id = ANY($1)`,
    [userIds]
  );
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  console.log(`  Got ${users.length} users`);

  // Step 3: Fetch product details
  const productIds = [...new Set(orders.map(o => o.product_id))];
  const { rows: products } = await productClient.query(
    `SELECT id, name, category FROM products WHERE id = ANY($1)`,
    [productIds]
  );
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  console.log(`  Got ${products.length} products`);

  await Promise.all([orderClient.end(), userClient.end(), productClient.end()]);

  // Step 4: Build CSV
  const header = 'customer_id,customer_email,customer_name,customer_joined,order_id,order_date,order_status,product_id,product_name,product_category,quantity,unit_price,total_price';
  const rows = orders.map(o => {
    const u = userMap[o.user_id] || {};
    const p = productMap[o.product_id] || {};
    const joined = u.created_at ? u.created_at.toISOString().slice(0, 10) : '';
    const orderDate = o.order_date ? new Date(o.order_date).toISOString().slice(0, 10) : '';
    return [
      o.user_id, u.email || '', u.name || '', joined,
      o.order_id, orderDate, o.status,
      o.product_id, p.name || '', p.category || '',
      o.quantity, o.unit_price, o.total_price,
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const outPath = path.join(__dirname, '../data/test-data-checkout.csv');
  fs.writeFileSync(outPath, csv);
  console.log(`\nWrote ${rows.length} rows to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
