import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Default migrations directory
const MIGRATIONS_DIR = '../db/migrations';

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Get mode from command line args
    const mode = process.argv[2] || 'latest'; // 'latest', 'all', or specific file

    // Determine which migration(s) to run
    if (mode === 'all') {
      // Run all migrations in order
      await runAllMigrations(pool);
    } else if (mode === 'latest') {
      // Run only the latest migration
      await runLatestMigration(pool);
    } else {
      // Run a specific migration file
      await runSpecificMigration(pool, mode);
    }
    
  } catch (error) {
    console.error('Error running migration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function runSpecificMigration(pool: Pool, migrationPath: string) {
  // If the path doesn't include the migrations directory, assume it's a filename
  // and prepend the migrations directory
  if (!migrationPath.includes('migrations')) {
    migrationPath = path.join(MIGRATIONS_DIR, migrationPath);
  }
  
  const fullPath = path.resolve(__dirname, migrationPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`Migration file not found: ${fullPath}`);
    process.exit(1);
  }
  
  const sql = fs.readFileSync(fullPath, 'utf8');
  
  console.log(`Running migration: ${path.basename(fullPath)}`);
  await pool.query(sql);
  console.log('Migration completed successfully.');
}

async function runAllMigrations(pool: Pool) {
  const migrationsDir = path.resolve(__dirname, MIGRATIONS_DIR);
  
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }
  
  // Get all migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure migrations run in order
  
  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }
  
  console.log(`Found ${files.length} migration files.`);
  
  // Run each migration in sequence
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
    console.log(`Completed migration: ${file}`);
  }
  
  console.log('All migrations completed successfully.');
}

async function runLatestMigration(pool: Pool) {
  const migrationsDir = path.resolve(__dirname, MIGRATIONS_DIR);
  
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }
  
  // Get all migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure we get the latest by name
  
  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }
  
  // Get the latest migration file
  const latestFile = files[files.length - 1];
  const fullPath = path.join(migrationsDir, latestFile);
  const sql = fs.readFileSync(fullPath, 'utf8');
  
  console.log(`Running latest migration: ${latestFile}`);
  await pool.query(sql);
  console.log('Latest migration completed successfully.');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
}); 