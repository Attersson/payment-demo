import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function setupDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Read and execute the SQL migration file
    const sqlPath = path.join(__dirname, '../db/migrations/001_create_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Creating database tables...');
    await pool.query(sql);
    console.log('Database setup completed successfully.');
    
    // Insert some test data if in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Adding test data...');
      
      // Insert test customer
      const customerResult = await pool.query(
        `INSERT INTO customers (external_id, provider, email, name) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ['cus_test123', 'stripe', 'test@example.com', 'Test User']
      );
      
      const customerId = customerResult.rows[0].id;
      
      // Insert test payment
      await pool.query(
        `INSERT INTO payments (transaction_id, provider, customer_id, amount, currency, status, description) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['pi_test123', 'stripe', customerId, 19.99, 'USD', 'succeeded', 'Test payment']
      );
      
      // Insert test subscription
      await pool.query(
        `INSERT INTO subscriptions (subscription_id, provider, customer_id, plan_id, status) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['sub_test123', 'stripe', customerId, 'price_test123', 'active']
      );
      
      console.log('Test data added successfully.');
    }
    
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupDatabase()
  .then(() => {
    console.log('Database setup complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database setup failed:', error);
    process.exit(1);
  }); 