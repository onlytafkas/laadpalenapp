/**
 * Shared in-memory PostgreSQL instance for integration tests.
 *
 * Usage in a test file:
 *   vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));
 *   import { mem } from "@/__tests__/integration/helpers/test-db";
 *
 *   let backup: ReturnType<typeof mem.backup>;
 *   beforeAll(() => { backup = mem.backup(); });
 *   beforeEach(() => { mem.restore(backup); });
 */
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const mem = newDb();

// Create schema tables matching db/schema.ts exactly.
// sessions.id uses GENERATED ALWAYS AS IDENTITY in production;
// pg-mem supports the syntax as of v2.x.
mem.public.none(`
  CREATE TABLE stations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  );

  CREATE TABLE usersinfo (
    user_id TEXT PRIMARY KEY,
    car_number_plate TEXT NOT NULL UNIQUE,
    mobile_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE sessions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL,
    station_id INTEGER NOT NULL REFERENCES stations(id),
    start_time TIMESTAMP NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP,
    reminder_start_sent BOOLEAN NOT NULL DEFAULT false,
    reminder_end_sent   BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    performed_by_user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    before_data JSON,
    after_data JSON,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`);

const { Pool } = mem.adapters.createPg();

/**
 * drizzle-orm/node-postgres v0.45+ passes two non-standard options in every
 * query config object that pg-mem's adapter does not support:
 *
 *  - types.getTypeParser  – custom type-parsing callbacks
 *  - rowMode: "array"     – return rows as positional arrays instead of objects
 *
 * Strategy:
 *   1. Strip both from the config before forwarding to pg-mem.
 *   2. When rowMode was "array", convert the object-keyed rows that pg-mem
 *      returns back into positional arrays using the `fields` descriptor,
 *      so drizzle-orm's internal row-mapping code stays correct.
 */
function adaptConfig(config: unknown): { stripped: unknown; needsArrayRows: boolean } {
  if (config === null || typeof config !== "object") {
    return { stripped: config, needsArrayRows: false };
  }
  const { types, rowMode, ...rest } = config as Record<string, unknown>;
  void types;
  return { stripped: rest, needsArrayRows: rowMode === "array" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArrayRows(result: any): any {
  if (!result?.rows?.length || Array.isArray(result.rows[0])) {
    return result;
  }
  // pg-mem always returns object rows and an empty fields array.
  // Object.values() preserves the key-insertion order that pg-mem uses when
  // it builds row objects, which matches the SELECT column order drizzle expects.
  return {
    ...result,
    rows: result.rows.map((row: Record<string, unknown>) => Object.values(row)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class CompatPool extends (Pool as any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(config: unknown, values?: any[]) {
    const { stripped, needsArrayRows } = adaptConfig(config);
    const promise = super.query(stripped, values) as Promise<unknown>;
    return needsArrayRows ? promise.then(toArrayRows) : promise;
  }

  async connect() {
    const client = await super.connect();
    const origQuery = client.query.bind(client);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.query = (config: unknown, ...rest: any[]) => {
      const { stripped, needsArrayRows } = adaptConfig(config);
      const promise = origQuery(stripped, ...rest) as Promise<unknown>;
      return needsArrayRows ? promise.then(toArrayRows) : promise;
    };
    return client;
  }
}

const pool = new CompatPool();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = drizzle(pool as any, { schema });
export { mem };

/**
 * An empty-database backup taken immediately after the schema is created.
 * Test files should call `emptyBackup.restore()` in `beforeAll` to ensure a
 * clean slate regardless of what previous test files may have left behind,
 * and again in `afterAll` to tidy up for the next file.
 */
export const emptyBackup = mem.backup();
