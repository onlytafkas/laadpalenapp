import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const { mockUserId, mockSendSessionEventSms } = vi.hoisted(() => ({
  mockUserId: { value: "admin_user" as string | null },
  mockSendSessionEventSms: vi.fn(),
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
vi.mock("@/lib/session-sms", () => ({
  sendSessionEventSms: mockSendSessionEventSms,
}));

import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import { triggerSessionRemindersAction } from "@/app/dashboard/actions";
import { createLoadingSession, getSessionById } from "@/data/loading-sessions";
import { createStation } from "@/data/stations";
import { createUser, updateUser } from "@/data/usersinfo";
import { getAllAuditLogs } from "@/data/audit";

let stationId: number;
let backup: ReturnType<typeof mem.backup>;

beforeAll(async () => {
  emptyBackup.restore();
  await createUser({ userId: "admin_user", carNumberPlate: "AD-001", mobileNumber: "+15550000070" });
  await updateUser({
    userId: "admin_user",
    carNumberPlate: "AD-001",
    mobileNumber: "+15550000070",
    isActive: true,
    isAdmin: true,
  });
  await createUser({ userId: "regular_user", carNumberPlate: "RG-001", mobileNumber: "+15550000071" });
  const station = await createStation({ name: "Reminder Action Station" });
  stationId = station.id;
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
  mockUserId.value = "admin_user";
  mockSendSessionEventSms.mockResolvedValue({ status: "sent" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("triggerSessionRemindersAction", () => {
  it("returns Unauthorized when no user is logged in", async () => {
    mockUserId.value = null;

    const result = await triggerSessionRemindersAction();

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Forbidden when the caller is not an admin", async () => {
    mockUserId.value = "regular_user";

    const result = await triggerSessionRemindersAction();

    expect(result).toEqual({ error: "Forbidden: Admin access required" });
  });

  it("marks due reminders and writes a success audit log for an admin", async () => {
    const startSession = await createLoadingSession({
      userId: "regular_user",
      stationId,
      startTime: new Date(Date.now() - 5 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 20 * 60_000).toISOString(),
    });
    const endSession = await createLoadingSession({
      userId: "regular_user",
      stationId,
      startTime: new Date(Date.now() - 90 * 60_000).toISOString(),
      endTime: new Date(Date.now() - 30 * 60_000).toISOString(),
    });

    const result = await triggerSessionRemindersAction();
    const updatedStart = await getSessionById(startSession.id);
    const updatedEnd = await getSessionById(endSession.id);
    const logs = await getAllAuditLogs();

    expect(result).toEqual({
      success: true,
      data: { startReminders: 1, endReminders: 1 },
    });
    expect(updatedStart?.reminderStartSent).toBe(true);
    expect(updatedEnd?.reminderEndSent).toBe(true);
    expect(
      logs.some((log) => log.action === "TRIGGER_SESSION_REMINDERS" && log.status === "success")
    ).toBe(true);
  });
});