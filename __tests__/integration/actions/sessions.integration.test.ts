/**
 * Integration tests for session server actions (app/dashboard/actions.ts)
 *
 * Mocks only Clerk, next/headers, next/cache.
 * Data layer + @/db run against real pg-mem.
 *
 * Tests session creation with real overlap and cooldown logic.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const { mockUserId } = vi.hoisted(() => ({
  mockUserId: { value: "sess_user" as string | null },
}));

vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId.value })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => null) })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { mockSendSessionEventSms } = vi.hoisted(() => ({
  mockSendSessionEventSms: vi.fn(),
}));

vi.mock("@/lib/session-sms", () => ({
  sendSessionEventSms: mockSendSessionEventSms,
}));

import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import { createSession, updateSession, deleteSession } from "@/app/dashboard/actions";
import { createUser } from "@/data/usersinfo";
import { createStation } from "@/data/stations";
import { createLoadingSession, getSessionById } from "@/data/loading-sessions";
import { getAllAuditLogs } from "@/data/audit";

const USER_ID = "sess_user";
let stationId: number;
let backup: ReturnType<typeof mem.backup>;

// Dates within today/tomorrow window for the "too far in future" guard
function isoTomorrow(h: number, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function isoToday(h: number, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function isoTodayPlusHours(offsetHours: number) {
  const d = new Date();
  d.setTime(d.getTime() + offsetHours * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString();
}

beforeAll(async () => {
  emptyBackup.restore();
  await createUser({ userId: USER_ID, carNumberPlate: "SS-001", mobileNumber: "+15550000001" });
  const station = await createStation({ name: "Session Action Station" });
  stationId = station.id;
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
  mockUserId.value = USER_ID;
  mockSendSessionEventSms.mockResolvedValue({ status: "sent" });
});

// ── createSession ──────────────────────────────────────────────────────────────

describe("createSession", () => {
  it("returns Unauthorized when no user is logged in", async () => {
    mockUserId.value = null;

    const result = await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns an error when the user has no userInfo record", async () => {
    mockUserId.value = "unregistered_user";

    const result = await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    expect(result).toMatchObject({ error: expect.stringContaining("not registered") });
  });

  it("returns an error when the user's account is deactivated", async () => {
    await createUser({
      userId: "deact_user",
      carNumberPlate: "DU-001",
      mobileNumber: "+15550000002",
      isActive: false,
    });

    mockUserId.value = "deact_user";

    const result = await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    expect(result).toMatchObject({ error: expect.stringContaining("deactivated") });
  });

  it("returns an error when the user's account has no mobile number", async () => {
    await createUser({ userId: "no_mobile_user", carNumberPlate: "NM-001" });
    mockUserId.value = "no_mobile_user";

    const result = await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    expect(result).toMatchObject({ error: expect.stringContaining("mobile number") });
  });

  it("creates a session and persists it, returning success with data", async () => {
    const result = await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({ userId: USER_ID, stationId }),
    });
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "created",
      userId: USER_ID,
      stationName: "Session Action Station",
      startTime: expect.any(Date),
      endTime: expect.any(Date),
    });
  });

  it("writes a success audit log for a successful session creation", async () => {
    await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    const logs = await getAllAuditLogs();
    const successLog = logs.find(
      (l) => l.action === "CREATE_SESSION" && l.status === "success"
    );

    expect(successLog).toBeDefined();
    expect(successLog!.performedByUserId).toBe(USER_ID);
  });

  it("returns needsConfirmation with an adjusted time when the slot is taken", async () => {
    // Seed an existing session from a DIFFERENT user so USER_ID's 4-hour cooldown
    // is not triggered, while the station slot is still blocked.
    await createUser({ userId: "blocker_user", carNumberPlate: "BL-001", mobileNumber: "+15550000003" });
    await createLoadingSession({
      userId: "blocker_user",
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    // Try to book at 10:30 — overlaps the existing + 5-min buffer
    const result = await createSession({
      stationId,
      startTime: isoToday(10, 30),
      endTime: isoToday(11, 30),
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      adjustedStartTime: expect.any(String),
      message: expect.stringContaining("next available slot"),
    });
  });

  it("returns a cooldown error when the user's last session ended less than 4 hours ago", async () => {
    // Seed a session that ended 1 hour ago
    const endedAt = isoTodayPlusHours(-1);
    const startedAt = isoTodayPlusHours(-2);
    await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: startedAt,
      endTime: endedAt,
    });

    // Try to create a session starting now — within 4h cooldown
    const result = await createSession({
      stationId,
      startTime: isoTodayPlusHours(0),
      endTime: isoTodayPlusHours(1),
    });

    expect(result).toMatchObject({ error: expect.stringContaining("4 hours") });
  });

  it("writes an unauthorized audit log entry when user is not logged in", async () => {
    mockUserId.value = null;

    await createSession({
      stationId,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    const logs = await getAllAuditLogs();
    const log = logs.find(
      (l) => l.action === "CREATE_SESSION" && l.status === "unauthorized"
    );
    expect(log).toBeDefined();
    expect(log!.performedByUserId).toBeNull();
  });
});

describe("updateSession", () => {
  it("updates a session, persists the change, and sends an SMS", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoTomorrow(10),
      endTime: isoTomorrow(11),
    });

    const result = await updateSession({
      id: session.id,
      stationId,
      startTime: isoTomorrow(12),
      endTime: isoTomorrow(13),
    });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({ id: session.id, stationId }),
    });

    const updated = await getSessionById(session.id);
    expect(updated).not.toBeNull();
    expect(new Date(updated!.startTime).getUTCHours()).toBe(new Date(isoTomorrow(12)).getUTCHours());
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "updated",
      userId: USER_ID,
      stationName: "Session Action Station",
      startTime: expect.any(Date),
      endTime: expect.any(Date),
    });
  });
});

describe("deleteSession", () => {
  it("deletes a session, removes it from the database, and sends an SMS", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: isoTomorrow(10),
      endTime: isoTomorrow(11),
    });

    const result = await deleteSession(session.id);

    expect(result).toEqual({ success: true });
    expect(await getSessionById(session.id)).toBeNull();
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "deleted",
      userId: USER_ID,
      stationName: "Session Action Station",
      startTime: expect.any(Date),
      endTime: expect.any(Date),
    });
  });
});
