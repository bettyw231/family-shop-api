// backend/setup-database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render
  }
});

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Creating tables...');
    
    // 1. ITEMS TABLE (solves price remembering problem)
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        buying_price DECIMAL(10,2),
        selling_price DECIMAL(10,2),
        stock INTEGER DEFAULT 0,
        barcode VARCHAR(50),
        category VARCHAR(50),
        last_updated TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // 2. CUSTOMERS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        total_credit DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // 3. CREDIT TRANSACTIONS (solves borrowing record problem)
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        item_name VARCHAR(100),
        quantity INTEGER DEFAULT 1,
        amount DECIMAL(10,2),
        transaction_date DATE DEFAULT CURRENT_DATE,
        due_date DATE,
        paid BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // 4. RETURNABLE BOTTLES (solves bottle tracking problem)
    await client.query(`
      CREATE TABLE IF NOT EXISTS bottles (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        bottle_type VARCHAR(50),
        quantity INTEGER DEFAULT 1,
        taken_date DATE DEFAULT CURRENT_DATE,
        returned BOOLEAN DEFAULT FALSE,
        returned_date DATE,
        deposit_amount DECIMAL(10,2) DEFAULT 0,
        notes TEXT
      );
    `);
    
    console.log('✅ All tables created successfully!');
    
    // Add some sample data
    await client.query(`
      INSERT INTO items (name, buying_price, selling_price, stock, category) 
      VALUES 
        ('Coca-Cola 500ml', 80, 100, 24, 'Beverages'),
        ('Lays Chips', 15, 20, 50, 'Snacks'),
        ('Dairy Milk Chocolate', 45, 60, 30, 'Chocolates')
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('✅ Sample data added!');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
  } finally {
    client.release();
    process.exit();
  }
};

createTables(); 
