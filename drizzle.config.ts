import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Ensure the connection string has the recommended SSL mode
let connectionString = process.env.DATABASE_URL!;
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') 
    ? '&sslmode=verify-full' 
    : '?sslmode=verify-full';
}

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
});
