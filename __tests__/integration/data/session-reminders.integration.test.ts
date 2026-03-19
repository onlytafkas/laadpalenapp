import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const { mockSendSessionEventSms } = vi.hoisted(() => ({
  mockSendSessionEventSms: vi.fn(),
}));

vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));
vi.mock("@/lib/session-sms", () => ({
  sendSessionEventSms: mockSendSessionEventSms,
}));

import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import { triggerSessionReminders } from "@/data/session-reminders";
import { createLoadingSession, getSessionById } from "@/data/loading-sessions";
import { createStation } from "@/data/stations";
import { createUser } from "@/data/usersinfo";

let stationId: number;
let backup: ReturnType<typeof mem.backup>;
const USER_ID = "reminder_user";

beforeAll(async () => {
  emptyBackup.restore();
  const station = await createStation({ name: "Reminder Station" });
  stationId = station.id;
  await createUser({ userId: USER_ID, carNumberPlate: "RM-001", mobileNumber: "+15550000061" });
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
  mockSendSessionEventSms.mockResolvedValue({ status: "sent" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("triggerSessionReminders", () => {
  it("sends a due start reminder and marks the start flag", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: new Date(Date.now() - 5 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 20 * 60_000).toISOString(),
    });

    const result = await triggerSessionReminders();
    const updated = await getSessionById(session.id);

    expect(result).toEqual({ startReminders: 1, endReminders: 0 });
    expect(updated?.reminderStartSent).toBe(true);
    expect(updated?.reminderEndSent).toBe(false);
  });

  it("sends a due end reminder and marks the end flag", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: new Date(Date.now() - 90 * 60_000).toISOString(),
      endTime: new Date(Date.now() - 30 * 60_000).toISOString(),
    });

    const result = await triggerSessionReminders();
    const updated = await getSessionById(session.id);

    expect(result).toEqual({ startReminders: 0, endReminders: 1 });
    expect(updated?.reminderStartSent).toBe(false);
    expect(updated?.reminderEndSent).toBe(true);
  });

  it("continues after an sms failure without marking the flag", async () => {
    const session = await createLoadingSession({
      userId: USER_ID,
      stationId,
      startTime: new Date(Date.now() - 5 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 20 * 60_000).toISOString(),
    });
    mockSendSessionEventSms.mockRejectedValue(new Error("Twilio error"));

    const result = await triggerSessionReminders();
    const updated = await getSessionById(session.id);

    expect(result).toEqual({ startReminders: 0, endReminders: 0 });
    expect(updated?.reminderStartSent).toBe(false);
  });
});