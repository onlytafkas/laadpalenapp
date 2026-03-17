import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Ensure the connection string has the recommended SSL mode
let connectionString = process.env.DATABASE_URL!;

// Add sslmode=verify-full if not already present (as recommended by the warning)
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') 
    ? '&sslmode=verify-full' 
    : '?sslmode=verify-full';
}

// Create a pool with the updated connection string
const pool = new Pool({
  connectionString,
});

const db = drizzle(pool);

export { db };