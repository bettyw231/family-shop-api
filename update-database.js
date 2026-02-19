// update-database.js (place in root folder)
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const updateDatabase = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Adding customer types to database...');
    
    // 1. Add customer_type to customers table
    await client.query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'regular'
    `);
    
    console.log('✅ Added customer_type column');
    
    // 2. Add due_date to credit_transactions
    await client.query(`
      ALTER TABLE credit_transactions 
      ADD COLUMN IF NOT EXISTS due_date DATE
    `);
    
    console.log('✅ Added due_date column');
    
    console.log('🎉 Database update complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    process.exit();
  }
};

updateDatabase();