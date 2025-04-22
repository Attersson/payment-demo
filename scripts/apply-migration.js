const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applyMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'payment_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'super',
  });

  try {
    console.log('Applying migration: 005_customers_table.sql');
    
    // Read the migration file
    const sqlPath = path.join(__dirname, '../db/migrations/005_customers_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    await pool.query(sql);
    
    console.log('Migration applied successfully.');
  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    await pool.end();
  }
}

applyMigration(); 