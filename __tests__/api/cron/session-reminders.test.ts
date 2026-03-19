import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
//  Hoist mocks before any imports
// -----------------------------------------------------------------------
const {
  mockTriggerSessionReminders,
} = vi.hoisted(() => ({
  mockTriggerSessionReminders: vi.fn(),
}));

vi.mock("@/data/session-reminders", () => ({
  triggerSessionReminders: mockTriggerSessionReminders,
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

const CRON_SECRET = "test-cron-secret-abc";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  mockTriggerSessionReminders.mockResolvedValue({ startReminders: 0, endReminders: 0 });
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
    expect(mockTriggerSessionReminders).toHaveBeenCalled();
  });

  it("returns the reminder counts from the shared reminder runner", async () => {
    mockTriggerSessionReminders.mockResolvedValue({ startReminders: 2, endReminders: 1 });

    const response = await GET(makeRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ startReminders: 2, endReminders: 1 });
  });
});
