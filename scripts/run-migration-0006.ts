import 'dotenv/config';
import { Pool } from 'pg';

let connectionString = process.env.DATABASE_URL!;
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') ? '&sslmode=verify-full' : '?sslmode=verify-full';
}

async function main() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query('ALTER TABLE usersinfo RENAME COLUMN active TO is_active');
    console.log('✅ Renamed active -> is_active');
  } catch (e: any) {
    console.log('ℹ️  Rename skipped (already done?):', e.message);
  }

  try {
    await client.query('ALTER TABLE usersinfo ADD COLUMN is_admin boolean NOT NULL DEFAULT false');
    console.log('✅ Added is_admin column');
  } catch (e: any) {
    console.log('ℹ️  is_admin skipped (already done?):', e.message);
  }

  client.release();
  await pool.end();
  console.log('Done.');
}

main().catch(console.error);
