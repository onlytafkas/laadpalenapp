import { vi } from "vitest";

/**
 * Shared mock for the Drizzle `db` object.
 *
 * Usage in a test file:
 *   vi.mock("@/db", () => import("@/__tests__/mocks/db"));
 *
 * Then in individual tests call helpers like mockSelect / mockInsert etc.
 * exported from this module to control what the db returns.
 */

// ---------------------------------------------------------------------------
// Core chainable builder returned by db.select / db.update / db.delete
// ---------------------------------------------------------------------------
function makeChainable(resolveWith: unknown) {
  const chainable: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "set",
    "values",
    "returning",
    "orderBy",
    "limit",
    "innerJoin",
    "leftJoin",
  ];
  methods.forEach((m) => {
    chainable[m] = vi.fn(() => chainable);
  });
  // Make it thenable so `await db.select()...` resolves
  (chainable as Record<string, unknown>).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve);
  return chainable;
}

// ---------------------------------------------------------------------------
// Controlled return stores (mutate these in tests)
// ---------------------------------------------------------------------------
export let _selectResult: unknown = [];
export let _insertResult: unknown = [];
export let _updateResult: unknown = [];
export let _queryResult: unknown = [];

export function setSelectResult(v: unknown) { _selectResult = v; }
export function setInsertResult(v: unknown) { _insertResult = v; }
export function setUpdateResult(v: unknown) { _updateResult = v; }
export function setQueryResult(v: unknown) { _queryResult = v; }

/** Reset all results back to empty arrays (call in beforeEach). */
export function resetMockDb() {
  _selectResult = [];
  _insertResult = [];
  _updateResult = [];
  _queryResult = [];
}

// ---------------------------------------------------------------------------
// The mock db export
// ---------------------------------------------------------------------------
export const db = {
  select: vi.fn(() => makeChainable(_selectResult)),
  insert: vi.fn(() => makeChainable(_insertResult)),
  update: vi.fn(() => makeChainable(_updateResult)),
  delete: vi.fn(() => makeChainable(undefined)),
  query: {
    sessions: {
      findMany: vi.fn(async () => _queryResult),
      findFirst: vi.fn(async () => (_queryResult as unknown[])[0] ?? null),
    },
    stations: {
      findMany: vi.fn(async () => _queryResult),
      findFirst: vi.fn(async () => (_queryResult as unknown[])[0] ?? null),
    },
    usersinfo: {
      findMany: vi.fn(async () => _queryResult),
      findFirst: vi.fn(async () => (_queryResult as unknown[])[0] ?? null),
    },
  },
};
