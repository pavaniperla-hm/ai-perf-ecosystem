'use strict';

const { faker } = require('@faker-js/faker');

const CATEGORIES = [
  'Electronics', 'Clothing', 'Books', 'Home & Garden',
  'Sports', 'Toys', 'Food & Beverage', 'Beauty & Health',
];

const TOTAL = 5_000;
const BATCH = 250;

async function createSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL        PRIMARY KEY,
      name        VARCHAR(500)  NOT NULL,
      description TEXT,
      price       NUMERIC(10,2) NOT NULL,
      category    VARCHAR(100),
      stock       INTEGER       NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_products_category ON products (category)`,
  );
}

async function seed(pool) {
  await createSchema(pool);

  const { rows: [{ count }] } = await pool.query(
    'SELECT COUNT(*) AS count FROM products',
  );
  if (parseInt(count, 10) >= TOTAL) {
    console.log(`Already have ${count} products — skipping seed.`);
    return;
  }

  console.log(`Seeding ${TOTAL.toLocaleString()} products …`);

  for (let i = 0; i < TOTAL; i += BATCH) {
    const batchEnd = Math.min(i + BATCH, TOTAL);
    const valuePlaceholders = [];
    const params = [];
    let p = 1;

    for (let j = i; j < batchEnd; j++) {
      valuePlaceholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(
        faker.commerce.productName(),
        faker.commerce.productDescription(),
        parseFloat(faker.commerce.price({ min: 0.99, max: 1999.99, dec: 2 })),
        CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
        faker.number.int({ min: 0, max: 999 }),
      );
    }

    await pool.query(
      `INSERT INTO products (name, description, price, category, stock)
       VALUES ${valuePlaceholders.join(',')}`,
      params,
    );
    console.log(`  ${batchEnd.toLocaleString()} / ${TOTAL.toLocaleString()}`);
  }

  console.log('Product seed complete.');
}

// Standalone execution
if (require.main === module) {
  const pool = require('./db');
  seed(pool)
    .then(() => pool.end())
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = seed;
