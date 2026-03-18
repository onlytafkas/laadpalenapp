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
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "performed_by_user_id" text,
        "action" text NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" text,
        "status" text NOT NULL,
        "error_message" text,
        "before_data" json,
        "after_data" json,
        "ip_address" text,
        "user_agent" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log('✅ Created audit_logs table');
  } catch (e: unknown) {
    console.log('ℹ️  audit_logs skipped (already done?):', (e as Error).message);
  }

  client.release();
  await pool.end();
  console.log('Done.');
}

main().catch(console.error);
