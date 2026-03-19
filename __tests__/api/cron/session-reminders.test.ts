import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
//  Hoist mocks before any imports
// -----------------------------------------------------------------------
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

import { GET } from "@/app/api/cron/session-reminders/route";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/cron/session-reminders", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

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

const CRON_SECRET = "test-cron-secret-abc";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.CRON_SECRET = CRON_SECRET;
  mockGetSessionsDueForStartReminder.mockResolvedValue([]);
  mockGetSessionsDueForEndReminder.mockResolvedValue([]);
  mockMarkReminderSent.mockResolvedValue(undefined);
  mockSendSessionEventSms.mockResolvedValue({ status: "sent" });
  mockGetStationById.mockResolvedValue({ id: 1, name: "Station A", description: null });
});

// -----------------------------------------------------------------------
// Auth guard
// -----------------------------------------------------------------------
describe("GET /api/cron/session-reminders", () => {
  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("CRON_SECRET");
  });

  it("returns 401 when authorization header is missing", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const response = await GET(makeRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  // -----------------------------------------------------------------------
  // No-op when nothing is due
  // -----------------------------------------------------------------------
  it("returns zero counts when no sessions are due", async () => {
    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ startReminders: 0, endReminders: 0 });
    expect(mockSendSessionEventSms).not.toHaveBeenCalled();
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Start reminders
  // -----------------------------------------------------------------------
  it("sends start reminders and marks them as sent", async () => {
    const session = makeSession({ id: 5 });
    mockGetSessionsDueForStartReminder.mockResolvedValue([session]);

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.startReminders).toBe(1);
    expect(body.endReminders).toBe(0);

    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "start_reminder", userId: session.userId })
    );
    expect(mockMarkReminderSent).toHaveBeenCalledWith(session.id, "start");
  });

  it("uses station name from getStationById in start reminder", async () => {
    mockGetSessionsDueForStartReminder.mockResolvedValue([makeSession({ stationId: 3 })]);
    mockGetStationById.mockResolvedValue({ id: 3, name: "Fast Charger", description: null });

    await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ stationName: "Fast Charger" })
    );
  });

  it("falls back to 'Station N' when getStationById returns null for start reminder", async () => {
    mockGetSessionsDueForStartReminder.mockResolvedValue([makeSession({ id: 9, stationId: 99 })]);
    mockGetStationById.mockResolvedValue(null);

    await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ stationName: "Station 99" })
    );
  });

  it("does not mark start reminder as sent when sendSessionEventSms throws", async () => {
    const session = makeSession({ id: 7 });
    mockGetSessionsDueForStartReminder.mockResolvedValue([session]);
    mockSendSessionEventSms.mockRejectedValue(new Error("Twilio error"));

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.startReminders).toBe(0);
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // End reminders
  // -----------------------------------------------------------------------
  it("sends end reminders and marks them as sent", async () => {
    const session = makeSession({ id: 6 });
    mockGetSessionsDueForEndReminder.mockResolvedValue([session]);

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.startReminders).toBe(0);
    expect(body.endReminders).toBe(1);

    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "end_reminder", userId: session.userId })
    );
    expect(mockMarkReminderSent).toHaveBeenCalledWith(session.id, "end");
  });

  it("does not mark end reminder as sent when sendSessionEventSms throws", async () => {
    const session = makeSession({ id: 8 });
    mockGetSessionsDueForEndReminder.mockResolvedValue([session]);
    mockSendSessionEventSms.mockRejectedValue(new Error("Twilio error"));

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.endReminders).toBe(0);
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });

  it("falls back to 'Station N' when getStationById returns null for end reminder", async () => {
    mockGetSessionsDueForEndReminder.mockResolvedValue([makeSession({ id: 13, stationId: 77 })]);
    mockGetStationById.mockResolvedValue(null);

    await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(mockSendSessionEventSms).toHaveBeenCalledWith(
      expect.objectContaining({ stationName: "Station 77" })
    );
  });

  // -----------------------------------------------------------------------
  // Both start and end in same run
  // -----------------------------------------------------------------------
  it("processes both start and end reminders in a single call", async () => {
    const startSession = makeSession({ id: 11 });
    const endSession = makeSession({ id: 12 });
    mockGetSessionsDueForStartReminder.mockResolvedValue([startSession]);
    mockGetSessionsDueForEndReminder.mockResolvedValue([endSession]);

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ startReminders: 1, endReminders: 1 });
    expect(mockMarkReminderSent).toHaveBeenCalledWith(startSession.id, "start");
    expect(mockMarkReminderSent).toHaveBeenCalledWith(endSession.id, "end");
  });
});
