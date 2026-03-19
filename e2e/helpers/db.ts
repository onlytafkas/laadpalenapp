/**
 * Drizzle ORM connection to the E2E test database.
 *
 * Uses E2E_DATABASE_URL from the environment (loaded by playwright.config.ts
 * via dotenv from .env.e2e.local).  This is intentionally separate from the
 * regular `db/index.ts` that targets the development database.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../db/schema";
import { withLibpqSslCompatibility } from "../../lib/postgres-connection-string";
import {
  assertSafeE2EDatabaseUrl,
  getRequiredE2EBranchName,
} from "./safety";

function getTestDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is not set. " +
        "Run e2e tests through scripts/e2e-run.ts so it can create a temporary Neon branch and inject the URL."
    );
  }

  getRequiredE2EBranchName();
  assertSafeE2EDatabaseUrl(url);

  return withLibpqSslCompatibility(url);
}

const pool = new Pool({ connectionString: getTestDatabaseUrl() });
export const testDb = drizzle(pool, { schema });
export { pool as testPool };
