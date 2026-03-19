import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetSessionsDueForStartReminder,
  mockGetSessionsDueForEndReminder,
  mockMarkReminderSent,
  mockSendSessionEventSms,
  mockGetStationById,
} = vi.hoisted(() => ({
  mockGetSessionsDueForStartReminder: vi.fn(),
  mockGetSessionsDueForEndReminder: vi.fn(),
  mockMarkReminderSent: vi.fn(),
  mockSendSessionEventSms: vi.fn(),
  mockGetStationById: vi.fn(),
}));

vi.mock("@/data/loading-sessions", () => ({
  getSessionsDueForStartReminder: mockGetSessionsDueForStartReminder,
  getSessionsDueForEndReminder: mockGetSessionsDueForEndReminder,
  markReminderSent: mockMarkReminderSent,
}));

vi.mock("@/lib/session-sms", () => ({
  sendSessionEventSms: mockSendSessionEventSms,
}));

vi.mock("@/data/stations", () => ({
  getStationById: mockGetStationById,
}));

import { triggerSessionReminders } from "@/data/session-reminders";

function makeSession(overrides: Partial<{
  id: number;
  userId: string;
  stationId: number;
  startTime: Date;
  endTime: Date | null;
}> = {}) {
  return {
    id: 1,
    userId: "user_test123",
    stationId: 1,
    startTime: new Date("2026-03-18T10:00:00.000Z"),
    endTime: new Date("2026-03-18T11:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockGetSessionsDueForStartReminder.mockResolvedValue([]);
  mockGetSessionsDueForEndReminder.mockResolvedValue([]);
  mockMarkReminderSent.mockResolvedValue(undefined);
  mockSendSessionEventSms.mockResolvedValue({ status: "sent" });
  mockGetStationById.mockResolvedValue({ id: 1, name: "Station A", description: null });
});

describe("triggerSessionReminders", () => {
  it("returns zero counts when no sessions are due", async () => {
    const result = await triggerSessionReminders();

    expect(result).toEqual({ startReminders: 0, endReminders: 0 });
    expect(mockSendSessionEventSms).not.toHaveBeenCalled();
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });

  it("sends start reminders and marks them as sent", async () => {
    const session = makeSession({ id: 5 });
    mockGetSessionsDueForStartReminder.mockResolvedValue([session]);

    const result = await triggerSessionReminders();

    expect(result).toEqual({ startReminders: 1, endReminders: 0 });
    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "start_reminder", userId: session.userId })
    );
    expect(mockMarkReminderSent).toHaveBeenCalledWith(session.id, "start");
  });

  it("falls back to the station id when the station lookup fails", async () => {
    mockGetSessionsDueForStartReminder.mockResolvedValue([makeSession({ stationId: 99 })]);
    mockGetStationById.mockResolvedValue(null);

    await triggerSessionReminders();

    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ stationName: "Station 99" })
    );
  });

  it("does not mark a reminder as sent when sms sending fails", async () => {
    const session = makeSession({ id: 7 });
    mockGetSessionsDueForStartReminder.mockResolvedValue([session]);
    mockSendSessionEventSms.mockRejectedValue(new Error("Twilio error"));

    const result = await triggerSessionReminders();

    expect(result).toEqual({ startReminders: 0, endReminders: 0 });
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });

  it("processes start and end reminders in a single run", async () => {
    const startSession = makeSession({ id: 11 });
    const endSession = makeSession({ id: 12 });
    mockGetSessionsDueForStartReminder.mockResolvedValue([startSession]);
    mockGetSessionsDueForEndReminder.mockResolvedValue([endSession]);

    const result = await triggerSessionReminders();

    expect(result).toEqual({ startReminders: 1, endReminders: 1 });
    expect(mockMarkReminderSent).toHaveBeenCalledWith(startSession.id, "start");
    expect(mockMarkReminderSent).toHaveBeenCalledWith(endSession.id, "end");
  });
});