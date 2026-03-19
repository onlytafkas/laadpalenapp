/**
 * Playwright global setup
 *
 * Runs once before all E2E tests.  Responsibilities:
 *   1. Initialise Clerk test mode
 *   2. Connect to the E2E test database (NOT the dev database)
 *   3. Wipe any leftover E2E rows from previous runs
 *   4. Seed the test database with a known, stable state:
 *        - admin user   (E2E_ADMIN_USER_ID,   isAdmin=true,  isActive=true)
 *        - regular user (E2E_REGULAR_USER_ID, isAdmin=false, isActive=true)
 *        - one station  ("E2E Test Station")
 *   5. Write seed IDs to a temp file so tests can reference them if needed
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { clerkSetup } from "@clerk/testing/playwright";
import { sql } from "drizzle-orm";
import { testDb, testPool } from "./helpers/db";
import { usersinfo, stations } from "../db/schema";

// Load e2e env vars before anything else so testDb picks up E2E_DATABASE_URL
dotenv.config({ path: path.resolve(__dirname, "../.env.e2e.local") });

const E2E_ADMIN_USER_ID = process.env.E2E_ADMIN_USER_ID ?? "user_e2e_admin";
const E2E_REGULAR_USER_ID =
  process.env.E2E_REGULAR_USER_ID ?? "user_e2e_regular";
const E2E_STATION_NAME = "E2E Test Station";
const SEED_FILE = path.resolve(__dirname, ".e2e-seed.json");

async function wipeE2ERows() {
  await testDb.execute(
    sql`TRUNCATE TABLE audit_logs, sessions, usersinfo, stations RESTART IDENTITY CASCADE`
  );
}

export default async function globalSetup() {
  // 1. Initialise Clerk test mode
  await clerkSetup();

  // 2. Wipe leftovers
  await wipeE2ERows();

  // 3. Seed admin user
  await testDb.insert(usersinfo).values({
    userId: E2E_ADMIN_USER_ID,
    carNumberPlate: "E2E-ADM-001",
    mobileNumber: "+15550001000",
    isActive: true,
    isAdmin: true,
  });

  // 4. Seed regular user
  await testDb.insert(usersinfo).values({
    userId: E2E_REGULAR_USER_ID,
    carNumberPlate: "E2E-USR-001",
    mobileNumber: "+15550001001",
    isActive: true,
    isAdmin: false,
  });

  // 5. Seed station
  const [seededStation] = await testDb
    .insert(stations)
    .values({ name: E2E_STATION_NAME, description: "Created by E2E setup" })
    .returning();

  // 6. Persist seed IDs for use in tests
  fs.writeFileSync(
    SEED_FILE,
    JSON.stringify({
      adminUserId: E2E_ADMIN_USER_ID,
      regularUserId: E2E_REGULAR_USER_ID,
      stationId: seededStation.id,
      stationName: E2E_STATION_NAME,
    }),
    "utf-8"
  );

  await testPool.end();
}
