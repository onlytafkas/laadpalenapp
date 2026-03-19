/**
 * Integration tests for data/loading-sessions.ts
 *
 * Focuses on scenarios that require real SQL to validate correctly:
 * - FK constraints
 * - Overlap detection with the 5-minute buffer against real rows
 * - 4-hour cooldown check against real rows
 * - findNextAvailableStartTime walking through chained conflicts
 * - findMaxEndTime against real next-session row
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));

import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import {
  createLoadingSession,
  getAllLoadingSessions,
  getUserLoadingSessions,
  getSessionById,
  updateLoadingSession,
  deleteLoadingSession,
  checkSessionOverlap,
  checkCooldownConstraint,
  findNextAvailableStartTime,
  findMaxEndTime,
  getSessionsDueForStartReminder,
  getSessionsDueForEndReminder,
  markReminderSent,
} from "@/data/loading-sessions";
import { createStation } from "@/data/stations";
import { createUser } from "@/data/usersinfo";

let backup: ReturnType<typeof mem.backup>;

// Seed data IDs
let stationId: number;
const USER_ID = "user_sess_test";

beforeAll(async () => {
  emptyBackup.restore();
  const station = await createStation({ name: "Integration Station" });
  stationId = station.id;
  await createUser({ userId: USER_ID, carNumberPlate: "IT-001", mobileNumber: "+15550000030" });
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
});

// helpers
function isoAt(h: number, m = 0) {
  return `2026-03-18T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}
function dateAt(h: number, m = 0) {
  return new Date(isoAt(h, m));
}

// ── createLoadingSession ─────────────────────────────────────────────────────

describe("createLoadingSession", () => {
  it("creates a session and returns a row with an auto-generated id", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(11),
    });

    expect(session.id).toBeTypeOf("number");
    expect(session.userId).toBe(USER_ID);
    expect(session.stationId).toBe(stationId);
  });

  it("strips seconds and milliseconds (minute precision)", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: "2026-03-18T10:15:45.999Z",
      endTime: "2026-03-18T11:30:59.123Z",
    });

    expect(new Date(session.startTime).getSeconds()).toBe(0);
    expect(new Date(session.startTime).getMilliseconds()).toBe(0);
    expect(new Date(session.endTime!).getSeconds()).toBe(0);
  });

  it("creates a session without endTime (open-ended)", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(14),
    });

    expect(session.endTime).toBeNull();
  });

  it("throws when stationId references a non-existent station (FK constraint)", async () => {
    await expect(
      createLoadingSession({
        userId: USER_ID,
        stationId: 99999,
        startTime: isoAt(10),
      })
    ).rejects.toThrow();
  });
});

// ── getSessionById ────────────────────────────────────────────────────────────

describe("getSessionById", () => {
  it("returns the session when found", async () => {
    const created = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
    });

    const found = await getSessionById(created.id);

    expect(found).not.toBeNull();
    expect(found!.userId).toBe(USER_ID);
  });

  it("returns null for a non-existent id", async () => {
    expect(await getSessionById(99999)).toBeNull();
  });
});

// ── getAllLoadingSessions / getUserLoadingSessions ─────────────────────────────

describe("getAllLoadingSessions", () => {
  it("returns sessions with the station relation eager-loaded", async () => {
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
    });

    const sessions = await getAllLoadingSessions();

    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].station).toBeDefined();
    expect(sessions[0].station.id).toBe(stationId);
  });
});

describe("getUserLoadingSessions", () => {
  it("returns only sessions belonging to the specified user", async () => {
    await createUser({ userId: "other_user", carNumberPlate: "OT-001", mobileNumber: "+15550000031" });
    await createLoadingSession({ userId: USER_ID, stationId, startTime: isoAt(10) });
    await createLoadingSession({ userId: "other_user", stationId, startTime: isoAt(13) });

    const userSessions = await getUserLoadingSessions(USER_ID);

    expect(userSessions.every((s) => s.userId === USER_ID)).toBe(true);
    expect(userSessions.length).toBe(1);
  });
});

// ── updateLoadingSession ──────────────────────────────────────────────────────

describe("updateLoadingSession", () => {
  it("updates endTime and persists the change", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
    });

    const updated = await updateLoadingSession({
      id: session.id,
      stationId,
      endTime: isoAt(12),
    });

    expect(new Date(updated.endTime!).getUTCHours()).toBe(12);
  });
});

// ── deleteLoadingSession ──────────────────────────────────────────────────────

describe("deleteLoadingSession", () => {
  it("removes the session from the database", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
    });

    await deleteLoadingSession(session.id);

    expect(await getSessionById(session.id)).toBeNull();
  });
});

// ── checkSessionOverlap ────────────────────────────────────────────────────────

describe("checkSessionOverlap", () => {
  it("returns false when the station has no existing sessions", async () => {
    const hasOverlap = await checkSessionOverlap(
      stationId,
      dateAt(10),
      dateAt(11)
    );
    expect(hasOverlap).toBe(false);
  });

  it("returns false when there is a gap larger than 5 minutes between sessions", async () => {
    // Existing session: 10:00–11:00
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(11),
    });

    // New session starts at 11:10 — 10-minute gap, well beyond the 5-min buffer
    const hasOverlap = await checkSessionOverlap(
      stationId,
      dateAt(11, 10),
      dateAt(12, 10)
    );
    expect(hasOverlap).toBe(false);
  });

  it("returns true when a new session starts within the 5-minute buffer after an existing one", async () => {
    // Existing session: 10:00–11:00
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(11),
    });

    // New session starts at 11:03 — inside the 5-minute gap requirement
    const hasOverlap = await checkSessionOverlap(
      stationId,
      dateAt(11, 3),
      dateAt(12, 3)
    );
    expect(hasOverlap).toBe(true);
  });

  it("returns true for a direct time overlap", async () => {
    // Existing: 10:00–12:00
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(12),
    });

    // New session overlaps: 11:00–13:00
    const hasOverlap = await checkSessionOverlap(
      stationId,
      dateAt(11),
      dateAt(13)
    );
    expect(hasOverlap).toBe(true);
  });

  it("excludes the specified session id when checking for updates", async () => {
    // Session A: 10:00–11:00
    const sessionA = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(11),
    });

    // Checking overlap for sessionA itself being updated to the same time should return false
    const hasOverlap = await checkSessionOverlap(
      stationId,
      dateAt(10),
      dateAt(11),
      sessionA.id // exclude self
    );
    expect(hasOverlap).toBe(false);
  });

  it("returns true for overlap with an open-ended session (no endTime, treated as 5-min)", async () => {
    // Open-ended session starting at 10:00
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
    });

    // New session tries to start at 10:03 — overlaps the 5-min default window
    const hasOverlap = await checkSessionOverlap(
      stationId,
      dateAt(10, 3),
      dateAt(11, 3)
    );
    expect(hasOverlap).toBe(true);
  });
});

// ── checkCooldownConstraint ────────────────────────────────────────────────────

describe("checkCooldownConstraint", () => {
  it("returns valid=true when the user has no existing sessions", async () => {
    const result = await checkCooldownConstraint(USER_ID, dateAt(10));
    expect(result.valid).toBe(true);
  });

  it("returns valid=true when the user's last session ended more than 4 hours ago", async () => {
    // Session ended at 06:00; new session at 10:30 — 4.5 hours later
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(5),
      endTime: isoAt(6),
    });

    const result = await checkCooldownConstraint(USER_ID, dateAt(10, 30));
    expect(result.valid).toBe(true);
  });

  it("returns valid=false when the user's last session ended less than 4 hours ago", async () => {
    // Session ended at 09:00; new session at 11:00 — only 2 hours later
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(8),
      endTime: isoAt(9),
    });

    const result = await checkCooldownConstraint(USER_ID, dateAt(11));
    expect(result.valid).toBe(false);
    expect(result.message).toContain("4 hours");
    expect(result.nextAvailableTime).toBeInstanceOf(Date);
  });

  it("returns valid=true when only sessions without end times exist (no constraint)", async () => {
    // Open-ended session — cooldown can't be computed
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(8),
    });

    const result = await checkCooldownConstraint(USER_ID, dateAt(10));
    expect(result.valid).toBe(true);
  });
});

// ── findNextAvailableStartTime ─────────────────────────────────────────────────

describe("findNextAvailableStartTime", () => {
  it("returns null when the requested time is already free", async () => {
    const next = await findNextAvailableStartTime(stationId, dateAt(10));
    expect(next).toBeNull();
  });

  it("returns the next free slot after a single blocking session", async () => {
    // Session: 10:00–11:00 → next free slot = 11:05 (11:00 + 5-min buffer)
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(11),
    });

    const next = await findNextAvailableStartTime(stationId, dateAt(10));

    expect(next).not.toBeNull();
    expect(next!.getUTCHours()).toBe(11);
    expect(next!.getUTCMinutes()).toBe(5);
  });

  it("skips chained consecutive sessions to find a truly free slot", async () => {
    // Session A: 10:00–11:00
    // Session B: 11:05–12:05 (5-min apart from A)
    // Requested: 10:00 → must skip both → next free = 12:10
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(10),
      endTime: isoAt(11),
    });
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(11, 5),
      endTime: isoAt(12, 5),
    });

    const next = await findNextAvailableStartTime(stationId, dateAt(10));

    expect(next).not.toBeNull();
    expect(next!.getUTCHours()).toBe(12);
    expect(next!.getUTCMinutes()).toBe(10);
  });
});

// ── findMaxEndTime ─────────────────────────────────────────────────────────────

describe("findMaxEndTime", () => {
  it("returns null when there is no next session (no upper limit)", async () => {
    const max = await findMaxEndTime(stationId, dateAt(10));
    expect(max).toBeNull();
  });

  it("returns 5 minutes before the next session's start time", async () => {
    // Next session starts at 12:00 → max end = 11:55
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoAt(12),
      endTime: isoAt(13),
    });

    const max = await findMaxEndTime(stationId, dateAt(10));

    expect(max).not.toBeNull();
    expect(max!.getUTCHours()).toBe(11);
    expect(max!.getUTCMinutes()).toBe(55);
  });
});

// ── Reminder helpers ─────────────────────────────────────────────────────────

describe("getSessionsDueForStartReminder", () => {
  it("returns an empty array when no sessions fall in the 15-minute window", async () => {
    // Create a session starting in 60 minutes — well outside the 14–16min window
    const farFuture = new Date(Date.now() + 60 * 60_000).toISOString();
    await createLoadingSession({ userId: USER_ID, stationId, startTime: farFuture });

    const due = await getSessionsDueForStartReminder();
    expect(due).toHaveLength(0);
  });

  it("returns a session whose startTime is exactly 15 minutes from now", async () => {
    const fifteenMin = new Date(Date.now() + 15 * 60_000).toISOString();
    await createLoadingSession({ userId: USER_ID, stationId, startTime: fifteenMin });

    const due = await getSessionsDueForStartReminder();
    expect(due.length).toBeGreaterThanOrEqual(1);
  });

  it("does not return a session once reminderStartSent is true", async () => {
    const fifteenMin = new Date(Date.now() + 15 * 60_000).toISOString();
    const created = await createLoadingSession({ userId: USER_ID, stationId, startTime: fifteenMin });

    await markReminderSent(created.id, "start");

    const due = await getSessionsDueForStartReminder();
    expect(due.find((s) => s.id === created.id)).toBeUndefined();
  });
});

describe("getSessionsDueForEndReminder", () => {
  it("returns an empty array when no session end times fall in the window", async () => {
    const farFuture = new Date(Date.now() + 60 * 60_000).toISOString();
    const farFutureEnd = new Date(Date.now() + 120 * 60_000).toISOString();
    await createLoadingSession({ userId: USER_ID, stationId, startTime: farFuture, endTime: farFutureEnd });

    const due = await getSessionsDueForEndReminder();
    expect(due).toHaveLength(0);
  });

  it("returns a session whose endTime is exactly 15 minutes from now", async () => {
    const past = new Date(Date.now() - 30 * 60_000).toISOString();
    const fifteenMin = new Date(Date.now() + 15 * 60_000).toISOString();
    await createLoadingSession({ userId: USER_ID, stationId, startTime: past, endTime: fifteenMin });

    const due = await getSessionsDueForEndReminder();
    expect(due.length).toBeGreaterThanOrEqual(1);
  });

  it("does not return a session once reminderEndSent is true", async () => {
    const past = new Date(Date.now() - 30 * 60_000).toISOString();
    const fifteenMin = new Date(Date.now() + 15 * 60_000).toISOString();
    const created = await createLoadingSession({ userId: USER_ID, stationId, startTime: past, endTime: fifteenMin });

    await markReminderSent(created.id, "end");

    const due = await getSessionsDueForEndReminder();
    expect(due.find((s) => s.id === created.id)).toBeUndefined();
  });
});

describe("markReminderSent", () => {
  it("sets reminderStartSent to true in the database", async () => {
    const session = await createLoadingSession({ userId: USER_ID, stationId, startTime: isoAt(10) });
    expect(session.reminderStartSent).toBe(false);

    await markReminderSent(session.id, "start");

    const updated = await getSessionById(session.id);
    expect(updated?.reminderStartSent).toBe(true);
    expect(updated?.reminderEndSent).toBe(false);
  });

  it("sets reminderEndSent to true in the database", async () => {
    const session = await createLoadingSession({ userId: USER_ID, stationId, startTime: isoAt(10), endTime: isoAt(11) });
    expect(session.reminderEndSent).toBe(false);

    await markReminderSent(session.id, "end");

    const updated = await getSessionById(session.id);
    expect(updated?.reminderEndSent).toBe(true);
    expect(updated?.reminderStartSent).toBe(false);
  });
});

