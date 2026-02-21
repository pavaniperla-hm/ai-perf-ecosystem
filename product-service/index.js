'use strict';

const express = require('express');
const pool    = require('./db');
const seed    = require('./seed');

const app  = express();
const PORT = parseInt(process.env.SERVICE_PORT || '8002', 10);

app.use(express.json());

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'product-service' });
});

// ── List products ───────────────────────────────────────────────────────────
app.get('/products', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.skip) || 0;
  const { rows } = await pool.query(
    'SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2',
    [limit, offset],
  );
  res.json(rows);
});

// ── Get product ─────────────────────────────────────────────────────────────
app.get('/products/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE id = $1',
    [req.params.id],
  );
  if (rows.length === 0)
    return res.status(404).json({ detail: 'Product not found' });
  res.json(rows[0]);
});

// ── Create product ──────────────────────────────────────────────────────────
app.post('/products', async (req, res) => {
  const { name, description, price, category, stock = 0 } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO products (name, description, price, category, stock)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, description, price, category, stock],
  );
  res.status(201).json(rows[0]);
});

// ── Update product ──────────────────────────────────────────────────────────
app.put('/products/:id', async (req, res) => {
  const { name, description, price, category, stock } = req.body;
  const { rows } = await pool.query(
    `UPDATE products
     SET name=$1, description=$2, price=$3, category=$4, stock=$5
     WHERE id=$6 RETURNING *`,
    [name, description, price, category, stock, req.params.id],
  );
  if (rows.length === 0)
    return res.status(404).json({ detail: 'Product not found' });
  res.json(rows[0]);
});

// ── Delete product ──────────────────────────────────────────────────────────
app.delete('/products/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM products WHERE id = $1',
    [req.params.id],
  );
  if (rowCount === 0)
    return res.status(404).json({ detail: 'Product not found' });
  res.status(204).end();
});

// ── Startup ─────────────────────────────────────────────────────────────────
async function start() {
  console.log('==> Seeding product database…');
  await seed(pool);
  app.listen(PORT, () =>
    console.log(`==> Product Service running on port ${PORT}`),
  );
}

start().catch((err) => { console.error(err); process.exit(1); });
