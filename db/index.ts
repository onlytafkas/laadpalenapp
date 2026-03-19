import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { withLibpqSslCompatibility } from '@/lib/postgres-connection-string';

// Match libpq compatibility semantics and silence the pg-connection-string warning.
const connectionString = withLibpqSslCompatibility(process.env.DATABASE_URL!);

// Create a pool with the updated connection string
const pool = new Pool({
  connectionString,
});

const db = drizzle(pool, { schema });

export { db };