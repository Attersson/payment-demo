import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function cleanDatabase() {
  console.log('Starting database cleanup...');
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('Connected to database, dropping all tables...');
    
    // Drop tables in order (respecting foreign key constraints)
    const dropTablesQuery = `
      -- Disable foreign key checks to avoid dependency issues
      SET session_replication_role = 'replica';
      
      -- Drop all tables if they exist
      DROP TABLE IF EXISTS plan_features CASCADE;
      DROP TABLE IF EXISTS scheduled_plan_changes CASCADE;
      DROP TABLE IF EXISTS webhook_events CASCADE;
      DROP TABLE IF EXISTS subscriptions CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS subscription_plans CASCADE;
      DROP TABLE IF EXISTS refunds CASCADE;
      
      -- Restore foreign key checks
      SET session_replication_role = 'origin';
    `;
    
    await pool.query(dropTablesQuery);
    console.log('Database tables successfully dropped.');
    
    console.log('Database cleanup completed successfully.');
  } catch (error) {
    console.error('Error cleaning database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanDatabase().catch(err => {
  console.error('Database cleanup failed:', err);
  process.exit(1);
}); 