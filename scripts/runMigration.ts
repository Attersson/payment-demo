import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Read and execute the SQL migration file
    const migrationPath = process.argv[2] || '../db/migrations/002_enhance_subscriptions.sql';
    const fullPath = path.resolve(__dirname, migrationPath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`Migration file not found: ${fullPath}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(fullPath, 'utf8');
    
    console.log(`Running migration: ${path.basename(fullPath)}`);
    await pool.query(sql);
    console.log('Migration completed successfully.');
    
  } catch (error) {
    console.error('Error running migration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
}); 