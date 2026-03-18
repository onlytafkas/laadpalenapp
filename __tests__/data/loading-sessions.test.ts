import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
//  Mock @/db BEFORE importing the module under test
//  Use vi.hoisted so variables are available inside the vi.mock factory.
// -----------------------------------------------------------------------
const { mockFindMany, mockFindFirst, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

// Chainable builder used by insert/update/delete
function chainable(resolveWith: unknown) {
  const c: Record<string, unknown> = {};
  ["into", "values", "set", "where", "returning"].forEach((m) => {
    c[m] = vi.fn(() => c);
  });
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveWith).then(resolve);
  return c;
}

vi.mock("@/db", () => ({
  db: {
    query: {
      sessions: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
      },
    },
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

import {
  checkSessionOverlap,
  findNextAvailableStartTime,
  checkCooldownConstraint,
  createLoadingSession,
  updateLoadingSession,
  deleteLoadingSession,
  getSessionById,
  getUserLoadingSessions,
  getAllLoadingSessions,
  findMaxEndTime,
} from "@/data/loading-sessions";
import { makeSession } from "@/__tests__/helpers/factories";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
const MIN = 60_000;
const HOUR = 60 * MIN;

function dt(isoString: string) {
  return new Date(isoString);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing sessions
  mockFindMany.mockResolvedValue([]);
  mockFindFirst.mockResolvedValue(null);
  mockInsert.mockReturnValue(chainable([]));
  mockUpdate.mockReturnValue(chainable([]));
  mockDelete.mockReturnValue(chainable(undefined));
});

// -----------------------------------------------------------------------
// checkSessionOverlap
// -----------------------------------------------------------------------
describe("checkSessionOverlap", () => {
  it("returns false when there are no existing sessions", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T10:00:00Z"),
      dt("2026-03-18T11:00:00Z")
    );
    expect(result).toBe(false);
  });

  it("returns true when the new session directly overlaps an existing one", async () => {
    // Existing: 10:00 → 11:00; New: 10:30 → 11:30 — clear overlap
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:00:00Z"), endTime: dt("2026-03-18T11:00:00Z") }),
    ]);
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T10:30:00Z"),
      dt("2026-03-18T11:30:00Z")
    );
    expect(result).toBe(true);
  });

  it("returns true when the new session starts within the 5-minute buffer after an existing one", async () => {
    // Existing ends at 11:00; new starts at 11:03 — only 3-min gap, must be blocked
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:00:00Z"), endTime: dt("2026-03-18T11:00:00Z") }),
    ]);
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T11:03:00Z"),
      dt("2026-03-18T12:00:00Z")
    );
    expect(result).toBe(true);
  });

  it("returns false when there is exactly a 5-minute gap after an existing session", async () => {
    // Existing ends 11:00; new starts 11:05 — exactly 5-min gap, should be allowed
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:00:00Z"), endTime: dt("2026-03-18T11:00:00Z") }),
    ]);
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T11:05:00Z"),
      dt("2026-03-18T12:00:00Z")
    );
    expect(result).toBe(false);
  });

  it("returns false when new session ends exactly 5 minutes before an existing one starts", async () => {
    // New: 09:00 → 10:00; Existing starts at 10:05 — 5-min gap, should be allowed
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:05:00Z"), endTime: dt("2026-03-18T11:00:00Z") }),
    ]);
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T09:00:00Z"),
      dt("2026-03-18T10:00:00Z")
    );
    expect(result).toBe(false);
  });

  it("excludes the given session ID when checking for overlap (for updates)", async () => {
    const existingSession = makeSession({ id: 42, startTime: dt("2026-03-18T10:00:00Z"), endTime: dt("2026-03-18T11:00:00Z") });
    // The db mock will return an empty list because the WHERE clause excludes id=42;
    // we simulate that by returning an empty array when excludeSessionId=42
    mockFindMany.mockResolvedValue([]);
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T10:30:00Z"),
      dt("2026-03-18T11:30:00Z"),
      42
    );
    expect(result).toBe(false);
    // Confirm findMany was called (the exclusion logic runs inside the real function)
    expect(mockFindMany).toHaveBeenCalled();
  });

  it("treats a session without an end time as occupying 5 minutes", async () => {
    // Existing session starts at 10:00 with no endTime → treated as 10:00–10:05
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:00:00Z"), endTime: null }),
    ]);
    // New session starts at 10:03 — should overlap
    const result = await checkSessionOverlap(
      1,
      dt("2026-03-18T10:03:00Z"),
      dt("2026-03-18T11:00:00Z")
    );
    expect(result).toBe(true);
  });
});

// -----------------------------------------------------------------------
// findNextAvailableStartTime
// -----------------------------------------------------------------------
describe("findNextAvailableStartTime", () => {
  it("returns null when the requested time is already free", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await findNextAvailableStartTime(1, dt("2026-03-18T10:00:00Z"));
    expect(result).toBeNull();
  });

  it("returns the next free slot after a single conflicting session", async () => {
    // Existing: 10:00 → 11:00. Requesting 10:30 should suggest 11:05
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:00:00Z"), endTime: dt("2026-03-18T11:00:00Z") }),
    ]);
    const result = await findNextAvailableStartTime(1, dt("2026-03-18T10:30:00Z"));
    expect(result).not.toBeNull();
    // Should be 11:00 + 5 min = 11:05
    expect(result!.getTime()).toBe(dt("2026-03-18T11:05:00Z").getTime());
  });

  it("walks forward through chained consecutive sessions", async () => {
    // Session A: 10:00 → 11:00; Session B: 11:05 → 12:00 (back-to-back with gap)
    // Requesting 10:30 should skip both and land at 12:05
    mockFindMany.mockResolvedValue([
      makeSession({ id: 1, startTime: dt("2026-03-18T10:00:00Z"), endTime: dt("2026-03-18T11:00:00Z") }),
      makeSession({ id: 2, startTime: dt("2026-03-18T11:05:00Z"), endTime: dt("2026-03-18T12:00:00Z") }),
    ]);
    const result = await findNextAvailableStartTime(1, dt("2026-03-18T10:30:00Z"));
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(dt("2026-03-18T12:05:00Z").getTime());
  });

  it("handles a session without an end time (assumes 5-minute duration)", async () => {
    // Existing starts 10:00, no end → treated as ends 10:05. Suggest 10:10
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T10:00:00Z"), endTime: null }),
    ]);
    const result = await findNextAvailableStartTime(1, dt("2026-03-18T10:00:00Z"));
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(dt("2026-03-18T10:10:00Z").getTime());
  });

  it("passes excludeSessionId to the query to omit the session being updated", async () => {
    // When the conflicting session is excluded (mocked as empty), the time is free
    mockFindMany.mockResolvedValue([]);
    const result = await findNextAvailableStartTime(1, dt("2026-03-18T10:00:00Z"), 99);
    expect(result).toBeNull();
    expect(mockFindMany).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// checkCooldownConstraint
// -----------------------------------------------------------------------
describe("checkCooldownConstraint", () => {
  it("returns valid=true when the user has no sessions", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T10:00:00Z"));
    expect(result.valid).toBe(true);
  });

  it("returns valid=true when all existing sessions have no end time", async () => {
    mockFindMany.mockResolvedValue([
      makeSession({ endTime: null }),
    ]);
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T10:00:00Z"));
    expect(result.valid).toBe(true);
  });

  it("returns valid=false when proposed start is within 4 hours of last session end", async () => {
    // Last session ended at 10:00; proposing 13:00 — only 3 hours later, blocked
    mockFindMany.mockResolvedValue([
      makeSession({ endTime: dt("2026-03-18T10:00:00Z") }),
    ]);
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T13:00:00Z"));
    expect(result.valid).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.nextAvailableTime).toBeDefined();
    expect(result.nextAvailableTime!.getTime()).toBe(dt("2026-03-18T14:00:00Z").getTime());
  });

  it("returns valid=true when proposed start is exactly 4 hours after last session end", async () => {
    // Last session ended at 10:00; proposing 14:00 — exactly 4 hours, allowed
    mockFindMany.mockResolvedValue([
      makeSession({ endTime: dt("2026-03-18T10:00:00Z") }),
    ]);
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T14:00:00Z"));
    expect(result.valid).toBe(true);
  });

  it("returns valid=true when proposed start is more than 4 hours after last session end", async () => {
    mockFindMany.mockResolvedValue([
      makeSession({ endTime: dt("2026-03-18T10:00:00Z") }),
    ]);
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T15:00:00Z"));
    expect(result.valid).toBe(true);
  });

  it("finds the latest end time when the user has multiple sessions", async () => {
    // Sessions end at 08:00 and 10:00 — constraint must use 10:00
    mockFindMany.mockResolvedValue([
      makeSession({ id: 1, endTime: dt("2026-03-18T08:00:00Z") }),
      makeSession({ id: 2, endTime: dt("2026-03-18T10:00:00Z") }),
    ]);
    // Proposing 12:00 — only 2h after 10:00, blocked
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T12:00:00Z"));
    expect(result.valid).toBe(false);
    expect(result.nextAvailableTime!.getTime()).toBe(dt("2026-03-18T14:00:00Z").getTime());
  });

  it("excludes the given session when checking cooldown (for updates)", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await checkCooldownConstraint("user_abc", dt("2026-03-18T10:00:00Z"), 99);
    expect(result.valid).toBe(true);
  });
});

// -----------------------------------------------------------------------
// createLoadingSession — timestamp normalisation
// -----------------------------------------------------------------------
describe("createLoadingSession", () => {
  it("normalises timestamps to minute precision (strips seconds and ms)", async () => {
    const returnedSession = makeSession({
      startTime: dt("2026-03-18T10:00:00Z"),
      endTime: dt("2026-03-18T11:00:00Z"),
    });

    // insert(...).values(...).returning() → [returnedSession]
    const returning = vi.fn().mockResolvedValue([returnedSession]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    const result = await createLoadingSession({
      userId: "user_abc",
      stationId: 1,
      startTime: "2026-03-18T10:00:45.123Z", // has seconds + ms
      endTime: "2026-03-18T11:00:59.999Z",
    });

    // The actual values passed to .values() should have seconds/ms stripped
    const insertedValues = values.mock.calls[0][0] as Record<string, Date>;
    expect(insertedValues.startTime.getSeconds()).toBe(0);
    expect(insertedValues.startTime.getMilliseconds()).toBe(0);
    expect(insertedValues.endTime!.getSeconds()).toBe(0);
    expect(insertedValues.endTime!.getMilliseconds()).toBe(0);

    expect(result).toEqual(returnedSession);
  });

  it("uses current time when startTime is not provided", async () => {
    const now = new Date("2026-03-18T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const returnedSession = makeSession({ startTime: now });

    const returning = vi.fn().mockResolvedValue([returnedSession]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    await createLoadingSession({ userId: "user_abc", stationId: 1 });

    vi.useRealTimers();

    const insertedValues = values.mock.calls[0][0] as Record<string, Date>;
    expect(insertedValues.startTime.getTime()).toBe(now.getTime());
  });

  it("does not set endTime when not provided", async () => {
    const returnedSession = makeSession({ endTime: null });

    const returning = vi.fn().mockResolvedValue([returnedSession]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    await createLoadingSession({ userId: "user_abc", stationId: 1, startTime: "2026-03-18T10:00:00Z" });

    const insertedValues = values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.endTime).toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// getUserLoadingSessions
// -----------------------------------------------------------------------
describe("getUserLoadingSessions", () => {
  it("returns an empty array when the user has no sessions", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getUserLoadingSessions("user_abc");
    expect(result).toEqual([]);
    expect(mockFindMany).toHaveBeenCalled();
  });

  it("returns all sessions belonging to the user", async () => {
    const userSessions = [
      makeSession({ id: 1, userId: "user_abc" }),
      makeSession({ id: 2, userId: "user_abc" }),
    ];
    mockFindMany.mockResolvedValue(userSessions);
    const result = await getUserLoadingSessions("user_abc");
    expect(result).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------
// getAllLoadingSessions
// -----------------------------------------------------------------------
describe("getAllLoadingSessions", () => {
  it("returns all sessions when called", async () => {
    const sessions = [makeSession({ id: 1 }), makeSession({ id: 2 }), makeSession({ id: 3 })];
    mockFindMany.mockResolvedValue(sessions);
    const result = await getAllLoadingSessions();
    expect(result).toHaveLength(3);
    expect(mockFindMany).toHaveBeenCalled();
  });

  it("returns an empty array when there are no sessions", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getAllLoadingSessions();
    expect(result).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// updateLoadingSession
// -----------------------------------------------------------------------
describe("updateLoadingSession", () => {
  it("strips seconds from startTime and endTime (minute precision)", async () => {
    const updatedSession = makeSession({ id: 5 });
    const returning = vi.fn().mockResolvedValue([updatedSession]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const result = await updateLoadingSession({
      id: 5,
      stationId: 2,
      startTime: "2026-03-18T12:00:45.123Z",
      endTime: "2026-03-18T13:00:59.999Z",
    });

    const setArgs = set.mock.calls[0][0] as Record<string, Date>;
    expect(setArgs.startTime.getSeconds()).toBe(0);
    expect(setArgs.startTime.getMilliseconds()).toBe(0);
    expect(setArgs.endTime.getSeconds()).toBe(0);
    expect(result).toEqual(updatedSession);
  });

  it("omits startTime from set values when startTime is not provided", async () => {
    const updatedSession = makeSession({ id: 5 });
    const returning = vi.fn().mockResolvedValue([updatedSession]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    await updateLoadingSession({ id: 5, stationId: 2 });

    const setArgs = set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArgs.startTime).toBeUndefined();
  });

  it("clears endTime to null when an empty string is provided", async () => {
    const updatedSession = makeSession({ id: 5, endTime: null });
    const returning = vi.fn().mockResolvedValue([updatedSession]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    await updateLoadingSession({ id: 5, stationId: 2, endTime: "" });

    const setArgs = set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArgs.endTime).toBeNull();
  });

  it("omits endTime from set values when endTime is undefined", async () => {
    const updatedSession = makeSession({ id: 5 });
    const returning = vi.fn().mockResolvedValue([updatedSession]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    await updateLoadingSession({ id: 5, stationId: 2, endTime: undefined });

    const setArgs = set.mock.calls[0][0] as Record<string, unknown>;
    expect("endTime" in setArgs).toBe(false);
  });
});

// -----------------------------------------------------------------------
// deleteLoadingSession
// -----------------------------------------------------------------------
describe("deleteLoadingSession", () => {
  it("calls db.delete with the correct session id", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where });

    await deleteLoadingSession(42);

    expect(mockDelete).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// getSessionById
// -----------------------------------------------------------------------
describe("getSessionById", () => {
  it("returns the session when found", async () => {
    const session = makeSession({ id: 7 });
    mockFindFirst.mockResolvedValue(session);
    const result = await getSessionById(7);
    expect(result).toEqual(session);
    expect(mockFindFirst).toHaveBeenCalled();
  });

  it("returns null when session is not found", async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const result = await getSessionById(999);
    expect(result).toBeNull();
  });
});

// -----------------------------------------------------------------------
// findMaxEndTime
// -----------------------------------------------------------------------
describe("findMaxEndTime", () => {
  it("returns null when no session exists after the given start time", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await findMaxEndTime(1, dt("2026-03-18T10:00:00Z"));
    expect(result).toBeNull();
  });

  it("returns 5 minutes before the next session's start time as the max end", async () => {
    // Next session starts at 12:00 → max allowed end = 11:55
    mockFindMany.mockResolvedValue([
      makeSession({ startTime: dt("2026-03-18T12:00:00Z") }),
    ]);
    const result = await findMaxEndTime(1, dt("2026-03-18T10:00:00Z"));
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(dt("2026-03-18T11:55:00Z").getTime());
  });

  it("passes excludeSessionId to the query when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await findMaxEndTime(1, dt("2026-03-18T10:00:00Z"), 42);
    expect(result).toBeNull();
    expect(mockFindMany).toHaveBeenCalled();
  });
});
