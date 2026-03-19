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
    await client.query(`
      ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS reminder_start_sent BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS reminder_end_sent   BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✅ Added reminder_start_sent and reminder_end_sent columns to sessions table');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
