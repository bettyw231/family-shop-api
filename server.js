// backend/server.js - COMPLETE VERSION
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection for Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render PostgreSQL
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL database on Render!');
    release();
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// ============ ROUTES ============

// 1. ITEMS ROUTES (For inventory management)
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const { name, buying_price, selling_price, stock, barcode, category } = req.body;
    
    const result = await pool.query(
      `INSERT INTO items (name, buying_price, selling_price, stock, barcode, category) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, buying_price, selling_price, stock || 0, barcode, category]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;
    
    const result = await pool.query(
      'UPDATE items SET stock = $1 WHERE id = $2 RETURNING *',
      [stock, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. CUSTOMERS ROUTES (For credit tracking)
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    
    const result = await pool.query(
      `INSERT INTO customers (name, phone, address) 
       VALUES ($1, $2, $3) RETURNING *`,
      [name, phone, address]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREDIT TRANSACTIONS (For borrowed items)
app.get('/api/credits', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ct.*, c.name as customer_name, c.phone 
      FROM credit_transactions ct
      LEFT JOIN customers c ON ct.customer_id = c.id
      ORDER BY ct.transaction_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/credits', async (req, res) => {
  try {
    const { customer_id, item_name, quantity, amount, due_date, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO credit_transactions 
       (customer_id, item_name, quantity, amount, due_date, notes) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [customer_id, item_name, quantity, amount, due_date, notes]
    );
    
    // Update customer's total credit
    await pool.query(
      'UPDATE customers SET total_credit = total_credit + $1 WHERE id = $2',
      [amount, customer_id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/credits/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Mark as paid
    const result = await pool.query(
      `UPDATE credit_transactions SET paid = true WHERE id = $1 RETURNING *`,
      [id]
    );
    
    // Reduce customer's total credit
    const credit = result.rows[0];
    await pool.query(
      'UPDATE customers SET total_credit = total_credit - $1 WHERE id = $2',
      [credit.amount, credit.customer_id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ BOTTLES ROUTES - COMPLETE WORKING VERSION ============

// GET all bottles (pending and returned)
// TEMPORARY ROUTE: Create bottles table
app.get('/api/create-bottles-table', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bottles (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        bottle_type VARCHAR(50) NOT NULL,
        quantity INTEGER DEFAULT 1,
        taken_date DATE DEFAULT CURRENT_DATE,
        returned BOOLEAN DEFAULT FALSE,
        returned_date DATE,
        deposit_amount DECIMAL(10,2) DEFAULT 0,
        notes TEXT
      );
    `);
    res.json({ message: '✅ Bottles table created or already exists' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bottles', async (req, res) => {
  console.log('GET /api/bottles called');
  try {
    const result = await pool.query(`
      SELECT b.*, 
             COALESCE(c.name, 'Unknown') as customer_name,
             c.phone
      FROM bottles b
      LEFT JOIN customers c ON b.customer_id = c.id
      ORDER BY b.taken_date DESC
    `);
    console.log(`Found ${result.rows.length} bottles`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET bottles error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST new bottle
app.post('/api/bottles', async (req, res) => {
  console.log('POST /api/bottles called with body:', req.body);
  try {
    const { customer_id, bottle_type, quantity, deposit_amount, notes } = req.body;
    
    // Validate
    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }
    if (!bottle_type) {
      return res.status(400).json({ error: 'bottle_type is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO bottles 
       (customer_id, bottle_type, quantity, deposit_amount, notes, taken_date, returned) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, false) 
       RETURNING *`,
      [
        customer_id, 
        bottle_type, 
        quantity || 1, 
        deposit_amount || 0, 
        notes || ''
      ]
    );
    
    console.log('Bottle saved:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST bottles error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT - mark bottle as returned
app.put('/api/bottles/:id/return', async (req, res) => {
  console.log('PUT /api/bottles/return called for id:', req.params.id);
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE bottles 
       SET returned = true, returned_date = CURRENT_DATE 
       WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    
    console.log('Bottle marked returned:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT bottles error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. DASHBOARD STATS
app.get('/api/stats', async (req, res) => {
  try {
    const itemsCount = await pool.query('SELECT COUNT(*) FROM items');
    const customersCount = await pool.query('SELECT COUNT(*) FROM customers');
    const pendingCredits = await pool.query(
      'SELECT COUNT(*) FROM credit_transactions WHERE paid = false'
    );
    const pendingBottles = await pool.query(
      'SELECT COUNT(*) FROM bottles WHERE returned = false'
    );
    
    res.json({
      total_items: parseInt(itemsCount.rows[0].count),
      total_customers: parseInt(customersCount.rows[0].count),
      pending_credits: parseInt(pendingCredits.rows[0].count),
      pending_bottles: parseInt(pendingBottles.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: '🏪 Family Shop Management API',
    version: '1.0.0',
    endpoints: {
      items: 'GET /api/items',
      add_item: 'POST /api/items',
      customers: 'GET /api/customers',
      credits: 'GET /api/credits',
      bottles: 'GET /api/bottles',
      stats: 'GET /api/stats'
    },
    database: 'PostgreSQL on Render',
    status: 'active'
  });
});

// Health check (required by Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'family-shop-api'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Shop API running on port ${PORT}`);
  console.log(`📡 Local: http://localhost:${PORT}`);
  console.log(`🗄️  Database: Connected to Render PostgreSQL`);
});