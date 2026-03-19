/**
 * Drizzle config for the E2E test database.
 *
 * Uses E2E_DATABASE_URL injected by the e2e runner so that schema pushes
 * target the temporary Neon branch created for the current run.
 *
 * Usage:
 *   This config is invoked automatically by scripts/e2e-run.ts after it
 *   creates a temporary Neon branch and exports E2E_DATABASE_URL.
 */
import "dotenv/config";
import path from "path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { withLibpqSslCompatibility } from "./lib/postgres-connection-string";

// Load .env.e2e.local for project-level config; E2E_DATABASE_URL itself is
// expected to be injected by scripts/e2e-run.ts for the current run.
config({ path: path.resolve(__dirname, ".env.e2e.local") });

const url = process.env.E2E_DATABASE_URL;
if (!url) {
  throw new Error(
    "E2E_DATABASE_URL is not set. Run schema pushes via scripts/e2e-run.ts so it can inject the temporary branch connection URL."
  );
}

const connectionString = withLibpqSslCompatibility(url);

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
