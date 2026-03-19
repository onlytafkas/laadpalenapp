import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { withLibpqSslCompatibility } from './lib/postgres-connection-string';

const connectionString = withLibpqSslCompatibility(process.env.DATABASE_URL!);

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
});
