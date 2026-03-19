/**
 * Playwright global teardown
 *
 * Runs once after all E2E tests.  Wipes every row created during the test run
 * so the test database is left in a clean state for the next run.
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { usersinfo, stations, sessions, auditLogs } from "../db/schema";

dotenv.config({ path: path.resolve(__dirname, "../.env.e2e.local") });

const E2E_ADMIN_USER_ID = process.env.E2E_ADMIN_USER_ID ?? "user_e2e_admin";
const E2E_REGULAR_USER_ID =
  process.env.E2E_REGULAR_USER_ID ?? "user_e2e_regular";
const E2E_NEW_USER_ID = process.env.E2E_NEW_USER_ID ?? "user_e2e_new";
const SEED_FILE = path.resolve(__dirname, ".e2e-seed.json");

export default async function globalTeardown() {
  // Create a fresh pool — globalSetup ends the shared pool from helpers/db,
  // so we must not reuse that module-cached instance here.
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL! });
  const testDb = drizzle(pool, { schema });

  try {
    // Delete in FK-safe order
    await testDb
      .delete(sessions)
      .where(
        inArray(sessions.userId, [E2E_ADMIN_USER_ID, E2E_REGULAR_USER_ID])
      );
    await testDb
      .delete(auditLogs)
      .where(
        inArray(auditLogs.performedByUserId, [
          E2E_ADMIN_USER_ID,
          E2E_REGULAR_USER_ID,
        ])
      );
    await testDb
      .delete(usersinfo)
      .where(
        inArray(usersinfo.userId, [
          E2E_ADMIN_USER_ID,
          E2E_REGULAR_USER_ID,
          E2E_NEW_USER_ID,
        ])
      );
    // Clean up all stations created by E2E tests (by naming convention)
    await testDb.execute(sql`DELETE FROM stations WHERE name LIKE 'E2E-%'`);

    if (fs.existsSync(SEED_FILE)) {
      fs.unlinkSync(SEED_FILE);
    }
  } finally {
    await pool.end();
  }
}
