import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

let connectionString = process.env.DATABASE_URL!;
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') ? '&sslmode=verify-full' : '?sslmode=verify-full';
}

const pool = new Pool({ connectionString });

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting migration 0005...');
    const migrationPath = join(process.cwd(), 'drizzle', '0005_remove_email_from_usersinfo.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    console.log('Executing SQL:', migrationSQL);
    await client.query(migrationSQL);
    
    console.log('\n✅ Migration 0005 completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
