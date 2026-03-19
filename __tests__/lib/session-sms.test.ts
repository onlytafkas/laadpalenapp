import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserInfo } = vi.hoisted(() => ({
  mockGetUserInfo: vi.fn(),
}));

vi.mock("@/data/usersinfo", () => ({
  getUserInfo: mockGetUserInfo,
}));

import { sendSessionEventSms } from "@/lib/session-sms";

describe("sendSessionEventSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TWILIO_API_BASE_URL;
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    mockGetUserInfo.mockResolvedValue({
      mobileNumber: "+15551112222",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(""),
      })
    );
  });

  it("returns skipped when Twilio is not configured", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;

    const result = await sendSessionEventSms({
      eventType: "created",
      userId: "user_test123",
      stationName: "Station A",
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z",
    });

    expect(result).toEqual({ status: "skipped", reason: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns skipped when the user has no phone number", async () => {
    mockGetUserInfo.mockResolvedValue({ mobileNumber: null });

    const result = await sendSessionEventSms({
      eventType: "updated",
      userId: "user_test123",
      stationName: "Station A",
      startTime: "2026-03-18T12:00:00.000Z",
      endTime: "2026-03-18T13:00:00.000Z",
    });

    expect(result).toEqual({ status: "skipped", reason: "missing_phone_number" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a Twilio request with the formatted session details", async () => {
    const result = await sendSessionEventSms({
      eventType: "deleted",
      userId: "user_test123",
      stationName: "Station A",
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z",
    });

    expect(result).toEqual({ status: "sent" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(request?.method).toBe("POST");
    expect(request?.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(request?.body)).toContain("To=%2B15551112222");
    expect(String(request?.body)).toContain("From=%2B15550000000");
    expect(
      decodeURIComponent(String(request?.body)).replace(/\+/g, " ")
    ).toContain(
      "Charging session cancelled. Station: Station A. Start: 2026-03-18 11:00 CET. End: 2026-03-18 12:00 CET."
    );
  });

  it("uses the configured Twilio API base URL", async () => {
    process.env.TWILIO_API_BASE_URL = "http://127.0.0.1:4010";

    const result = await sendSessionEventSms({
      eventType: "created",
      userId: "user_test123",
      stationName: "Station A",
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z",
    });

    expect(result).toEqual({ status: "sent" });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:4010/2010-04-01/Accounts/AC123/Messages.json",
      expect.any(Object)
    );
  });

  it("sends the correct start_reminder message body", async () => {
    const result = await sendSessionEventSms({
      eventType: "start_reminder",
      userId: "user_test123",
      stationName: "Station B",
      startTime: "2026-03-18T14:00:00.000Z",
      endTime: "2026-03-18T15:00:00.000Z",
    });

    expect(result).toEqual({ status: "sent" });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(
      decodeURIComponent(String(request?.body)).replace(/\+/g, " ")
    ).toContain(
      "Your charging session starts in 15 minutes. Station: Station B. Start: 2026-03-18 15:00 CET. End: 2026-03-18 16:00 CET."
    );
  });

  it("sends the correct end_reminder message body", async () => {
    const result = await sendSessionEventSms({
      eventType: "end_reminder",
      userId: "user_test123",
      stationName: "Station C",
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z",
    });

    expect(result).toEqual({ status: "sent" });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(
      decodeURIComponent(String(request?.body)).replace(/\+/g, " ")
    ).toContain(
      "Your charging session ends in 15 minutes. Station: Station C. End: 2026-03-18 12:00 CET."
    );
  });

  it("omits End line in start_reminder when session has no end time", async () => {
    const result = await sendSessionEventSms({
      eventType: "start_reminder",
      userId: "user_test123",
      stationName: "Station D",
      startTime: "2026-03-18T09:00:00.000Z",
      endTime: null,
    });

    expect(result).toEqual({ status: "sent" });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const decoded = decodeURIComponent(String(request?.body)).replace(/\+/g, " ");
    expect(decoded).toContain("Your charging session starts in 15 minutes.");
    expect(decoded).not.toContain("End:");
  });

  it("throws when the Twilio API returns a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("Bad Request"),
      })
    );

    await expect(
      sendSessionEventSms({
        eventType: "created",
        userId: "user_test123",
        stationName: "Station A",
        startTime: "2026-03-18T10:00:00.000Z",
        endTime: null,
      })
    ).rejects.toThrow("Twilio SMS request failed: 400 Bad Request");
  });
});
