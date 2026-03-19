import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// All mocks must be hoisted before any imports of the module under test.
// Use vi.hoisted() so variables are available inside vi.mock factories.
// -----------------------------------------------------------------------

const {
  mockAuthUserId,
  mockGetUserInfo,
  mockCheckCooldownConstraint,
  mockCheckSessionOverlap,
  mockFindNextAvailableStartTime,
  mockCreateLoadingSession,
  mockGetSessionById,
  mockUpdateLoadingSession,
  mockDeleteLoadingSession,
  mockCreateStation,
  mockUpdateStation,
  mockDeleteStation,
  mockCheckStationHasSessions,
  mockGetStationById,
  mockCreateUser,
  mockUpdateUser,
  mockDeactivateUser,
  mockActivateUser,
  mockSendSessionEventSms,
} = vi.hoisted(() => ({
  mockAuthUserId: { value: "user_test123" as string | null },
  mockGetUserInfo: vi.fn(),
  mockCheckCooldownConstraint: vi.fn(),
  mockCheckSessionOverlap: vi.fn(),
  mockFindNextAvailableStartTime: vi.fn(),
  mockCreateLoadingSession: vi.fn(),
  mockGetSessionById: vi.fn(),
  mockUpdateLoadingSession: vi.fn(),
  mockDeleteLoadingSession: vi.fn(),
  mockCreateStation: vi.fn(),
  mockUpdateStation: vi.fn(),
  mockDeleteStation: vi.fn(),
  mockCheckStationHasSessions: vi.fn(),
  mockGetStationById: vi.fn(),
  mockCreateUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockDeactivateUser: vi.fn(),
  mockActivateUser: vi.fn(),
  mockSendSessionEventSms: vi.fn(),
}));

// -- Clerk auth --
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockAuthUserId.value })),
}));

// -- next/headers --
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: vi.fn(() => null),
  })),
}));

// -- next/cache --
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/data/loading-sessions", () => ({
  getUserLoadingSessions: vi.fn(),
  getAllLoadingSessions: vi.fn(),
  createLoadingSession: mockCreateLoadingSession,
  updateLoadingSession: mockUpdateLoadingSession,
  deleteLoadingSession: mockDeleteLoadingSession,
  getSessionById: mockGetSessionById,
  checkSessionOverlap: mockCheckSessionOverlap,
  findMaxEndTime: vi.fn(),
  findNextAvailableStartTime: mockFindNextAvailableStartTime,
  checkCooldownConstraint: mockCheckCooldownConstraint,
}));

vi.mock("@/data/stations", () => ({
  createStation: mockCreateStation,
  updateStation: mockUpdateStation,
  deleteStation: mockDeleteStation,
  checkStationHasSessions: mockCheckStationHasSessions,
  getStationById: mockGetStationById,
  getAllStations: vi.fn(),
}));

vi.mock("@/data/usersinfo", () => ({
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
  deactivateUser: mockDeactivateUser,
  activateUser: mockActivateUser,
  getUserInfo: mockGetUserInfo,
  getAllUsers: vi.fn(),
  checkUserHasSessions: vi.fn(),
}));

vi.mock("@/data/audit", () => ({
  insertAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session-sms", () => ({
  sendSessionEventSms: mockSendSessionEventSms,
}));

// -----------------------------------------------------------------------
// Import actions after mocks are registered
// -----------------------------------------------------------------------
import {
  createSession,
  updateSession,
  deleteSession,
  createStationAction,
  updateStationAction,
  deleteStationAction,
  createUserAction,
  updateUserAction,
  deactivateUserAction,
  activateUserAction,
} from "@/app/dashboard/actions";
import { makeSession, makeStation, makeUserInfo } from "@/__tests__/helpers/factories";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function activeUser(overrides = {}) {
  return makeUserInfo({ isActive: true, isAdmin: false, ...overrides });
}

function adminUser(overrides = {}) {
  return makeUserInfo({ isActive: true, isAdmin: true, ...overrides });
}

function validSessionInput() {
  // Set to tomorrow so the "too far in the future" guard doesn't fire
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setHours(11, 0, 0, 0);
  return {
    stationId: 1,
    startTime: tomorrow.toISOString(),
    endTime: end.toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Restore default: authenticated as a regular active user
  mockAuthUserId.value = "user_test123";
  mockGetUserInfo.mockResolvedValue(activeUser());
  mockCheckCooldownConstraint.mockResolvedValue({ valid: true });
  mockCheckSessionOverlap.mockResolvedValue(false);
  mockFindNextAvailableStartTime.mockResolvedValue(null);
  mockCreateLoadingSession.mockResolvedValue(makeSession());
  mockSendSessionEventSms.mockResolvedValue({ status: "sent" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// -----------------------------------------------------------------------
// createSession
// -----------------------------------------------------------------------
describe("createSession", () => {
  it("returns error when user is not authenticated", async () => {
    mockAuthUserId.value = null;
    const result = await createSession(validSessionInput());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when user is not registered in the system", async () => {
    mockGetUserInfo.mockResolvedValue(null);
    const result = await createSession(validSessionInput());
    expect(result.error).toMatch(/not registered/i);
  });

  it("returns error when user account is deactivated", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isActive: false }));
    const result = await createSession(validSessionInput());
    expect(result.error).toMatch(/deactivated/i);
  });

  it("returns error when user account has no mobile number", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ mobileNumber: null }));
    const result = await createSession(validSessionInput());
    expect(result.error).toMatch(/mobile number/i);
  });

  it("returns error when cooldown constraint is violated", async () => {
    mockCheckCooldownConstraint.mockResolvedValue({
      valid: false,
      message: "You must wait 4 hours after your last session ends.",
      nextAvailableTime: new Date(),
    });
    const result = await createSession(validSessionInput());
    expect(result.error).toMatch(/4 hours/i);
  });

  it("returns needsConfirmation with adjusted times when slot is taken", async () => {
    mockCheckSessionOverlap.mockResolvedValue(true);
    const nextStart = new Date();
    nextStart.setHours(nextStart.getHours() + 2);
    mockFindNextAvailableStartTime.mockResolvedValue(nextStart);

    const result = await createSession(validSessionInput());
    expect(result).toMatchObject({
      needsConfirmation: true,
      adjustedStartTime: expect.any(String),
      message: expect.stringContaining("next available slot"),
    });
  });

  it("returns error when there is an overlap but no available slot could be found", async () => {
    mockCheckSessionOverlap.mockResolvedValue(true);
    // findNextAvailableStartTime returns null → means no free slot suggestion
    mockFindNextAvailableStartTime.mockResolvedValue(null);

    const result = await createSession(validSessionInput());
    expect(result).toEqual({
      error: "This time slot conflicts with another session. Please choose a different time.",
    });
  });

  it("returns success when all checks pass", async () => {
    const session = makeSession();
    mockCreateLoadingSession.mockResolvedValue(session);
    mockGetStationById.mockResolvedValue(makeStation({ id: session.stationId, name: "Station A" }));

    const result = await createSession(validSessionInput());
    expect(result).toEqual({ success: true, data: session });
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "created",
      userId: session.userId,
      stationName: "Station A",
      startTime: session.startTime,
      endTime: session.endTime,
    });
  });

  it("returns validation error for invalid stationId (Zod)", async () => {
    const result = await createSession({
      stationId: -1, // invalid: must be positive
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(result.error).toBeDefined();
  });

  it("returns error when startTime is beyond tomorrow", async () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 5);
    const result = await createSession({
      stationId: 1,
      startTime: farFuture.toISOString(),
      endTime: new Date(farFuture.getTime() + 3600000).toISOString(),
    });
    expect(result.error).toMatch(/day after today/i);
  });
});

// -----------------------------------------------------------------------
// deleteSession
// -----------------------------------------------------------------------
describe("deleteSession", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await deleteSession(1);
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when session does not exist", async () => {
    mockGetSessionById.mockResolvedValue(null);
    const result = await deleteSession(999);
    expect(result).toEqual({ error: "Session not found" });
  });

  it("returns error when user tries to delete someone else's session without admin rights", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "other_user" }));
    // caller is a non-admin active user
    mockGetUserInfo.mockResolvedValue(activeUser({ userId: "user_test123" }));

    const result = await deleteSession(1);
    expect(result).toEqual({ error: "Forbidden" });
  });

  it("allows the session owner to delete their own session", async () => {
    const session = makeSession({ userId: "user_test123" });
    mockGetSessionById.mockResolvedValue(session);
    mockGetStationById.mockResolvedValue(makeStation({ id: session.stationId, name: "Station A" }));
    mockDeleteLoadingSession.mockResolvedValue(undefined);

    const result = await deleteSession(1);
    expect(result).toEqual({ success: true });
    expect(mockDeleteLoadingSession).toHaveBeenCalledWith(1);
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "deleted",
      userId: session.userId,
      stationName: "Station A",
      startTime: session.startTime,
      endTime: session.endTime,
    });
  });

  it("allows an active admin to delete any session", async () => {
    const session = makeSession({ userId: "other_user" });
    mockGetSessionById.mockResolvedValue(session);
    mockGetStationById.mockResolvedValue(makeStation({ id: session.stationId, name: "Station A" }));
    mockGetUserInfo.mockResolvedValue(adminUser({ userId: "user_test123" }));
    mockDeleteLoadingSession.mockResolvedValue(undefined);

    const result = await deleteSession(1);
    expect(result).toEqual({ success: true });
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "deleted",
      userId: session.userId,
      stationName: "Station A",
      startTime: session.startTime,
      endTime: session.endTime,
    });
  });
});

// -----------------------------------------------------------------------
// createStationAction
// -----------------------------------------------------------------------
describe("createStationAction", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await createStationAction({ name: "Station X" });
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when user is not an admin", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await createStationAction({ name: "Station X" });
    expect(result.error).toMatch(/admin/i);
  });

  it("returns error when admin is inactive", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser({ isActive: false }));
    const result = await createStationAction({ name: "Station X" });
    expect(result.error).toMatch(/admin/i);
  });

  it("returns validation error when station name is empty (Zod)", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    const result = await createStationAction({ name: "" });
    expect(result.error).toBeDefined();
  });

  it("creates the station successfully when called by an active admin", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    const station = makeStation({ id: 10, name: "Station X" });
    mockCreateStation.mockResolvedValue(station);

    const result = await createStationAction({ name: "Station X" });
    expect(result).toEqual({ success: true, data: station });
  });
});

// -----------------------------------------------------------------------
// deleteStationAction
// -----------------------------------------------------------------------
describe("deleteStationAction", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await deleteStationAction(1);
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when non-admin tries to delete a station", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await deleteStationAction(1);
    expect(result.error).toMatch(/admin/i);
  });

  it("returns error when station is not found", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockGetStationById.mockResolvedValue(undefined);
    const result = await deleteStationAction(999);
    expect(result).toEqual({ error: "Station not found" });
  });

  it("returns error when station has active sessions", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockGetStationById.mockResolvedValue(makeStation({ id: 1 }));
    mockCheckStationHasSessions.mockResolvedValue(true);

    const result = await deleteStationAction(1);
    expect(result.error).toMatch(/reservation|session/i);
  });

  it("deletes the station successfully when no active sessions exist", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockGetStationById.mockResolvedValue(makeStation({ id: 1 }));
    mockCheckStationHasSessions.mockResolvedValue(false);
    mockDeleteStation.mockResolvedValue(undefined);

    const result = await deleteStationAction(1);
    expect(result).toEqual({ success: true });
    expect(mockDeleteStation).toHaveBeenCalledWith(1);
  });
});

// -----------------------------------------------------------------------
// updateSession
// -----------------------------------------------------------------------
describe("updateSession", () => {
  function validUpdateInput() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(11, 0, 0, 0);
    return { id: 1, stationId: 1, startTime: tomorrow.toISOString(), endTime: end.toISOString() };
  }

  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when session does not exist", async () => {
    mockGetSessionById.mockResolvedValue(null);
    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ error: "Session not found" });
  });

  it("returns error when user tries to update someone else's session without admin rights", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "other_user" }));
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ error: "Forbidden" });
  });

  it("returns needsConfirmation when slot is taken and an adjusted time is available", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "user_test123" }));
    mockCheckSessionOverlap.mockResolvedValue(true);
    const nextStart = new Date();
    nextStart.setHours(nextStart.getHours() + 2);
    mockFindNextAvailableStartTime.mockResolvedValue(nextStart);

    const result = await updateSession(validUpdateInput());
    expect(result).toMatchObject({
      needsConfirmation: true,
      adjustedStartTime: expect.any(String),
      message: expect.stringContaining("next available slot"),
    });
  });

  it("returns conflict error when slot is taken and no alternative is available", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "user_test123" }));
    mockCheckSessionOverlap.mockResolvedValue(true);
    mockFindNextAvailableStartTime.mockResolvedValue(null);

    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({
      error: "This time slot conflicts with another session. Please choose a different time.",
    });
  });

  it("returns success and sends an SMS when the update succeeds", async () => {
    const existingSession = makeSession({ userId: "user_test123" });
    const updatedSession = makeSession({
      id: 1,
      userId: "user_test123",
      startTime: new Date("2026-03-18T12:00:00.000Z"),
      endTime: new Date("2026-03-18T13:00:00.000Z"),
    });
    mockGetSessionById.mockResolvedValue(existingSession);
    mockGetStationById.mockResolvedValue(makeStation({ id: updatedSession.stationId, name: "Station A" }));
    mockUpdateLoadingSession.mockResolvedValue(updatedSession);

    const result = await updateSession(validUpdateInput());

    expect(result).toEqual({ success: true, data: updatedSession });
    expect(mockSendSessionEventSms).toHaveBeenCalledWith({
      eventType: "updated",
      userId: updatedSession.userId,
      stationName: "Station A",
      startTime: updatedSession.startTime,
      endTime: updatedSession.endTime,
    });
  });

  it("allows the session owner to update their own session successfully", async () => {
    const session = makeSession({ userId: "user_test123" });
    mockGetSessionById.mockResolvedValue(session);
    mockUpdateLoadingSession.mockResolvedValue(session);

    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ success: true, data: session });
    expect(mockUpdateLoadingSession).toHaveBeenCalled();
  });

  it("allows an active admin to update any session", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "other_user" }));
    mockGetUserInfo.mockResolvedValue(adminUser());
    const updatedSession = makeSession({ userId: "other_user" });
    mockUpdateLoadingSession.mockResolvedValue(updatedSession);

    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ success: true, data: updatedSession });
  });
});

// -----------------------------------------------------------------------
// updateStationAction
// -----------------------------------------------------------------------
describe("updateStationAction", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await updateStationAction({ id: 1, name: "Updated Station" });
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when user is not an admin", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await updateStationAction({ id: 1, name: "Updated Station" });
    expect(result.error).toMatch(/admin/i);
  });

  it("returns validation error when station name is empty", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    const result = await updateStationAction({ id: 1, name: "" });
    expect(result.error).toBeDefined();
  });

  it("updates the station successfully when called by an active admin", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockGetStationById.mockResolvedValue(makeStation({ id: 1 }));
    const updatedStation = makeStation({ id: 1, name: "Updated Station" });
    mockUpdateStation.mockResolvedValue(updatedStation);

    const result = await updateStationAction({ id: 1, name: "Updated Station" });
    expect(result).toEqual({ success: true, data: updatedStation });
    expect(mockUpdateStation).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// createUserAction
// -----------------------------------------------------------------------
describe("createUserAction", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await createUserAction({ userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567" });
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when user is not an admin", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await createUserAction({ userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567" });
    expect(result.error).toMatch(/admin/i);
  });

  it("returns validation error when userId is empty", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    const result = await createUserAction({ userId: "", carNumberPlate: "ABC123", mobileNumber: "+15551234567" });
    expect(result.error).toBeDefined();
  });

  it("creates the user successfully when called by an active admin", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    const newUser = makeUserInfo({ userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567" });
    mockCreateUser.mockResolvedValue(newUser);

    const result = await createUserAction({ userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567" });
    expect(result).toEqual({ success: true, data: newUser });
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567", isActive: true })
    );
  });

  it("returns error when the data layer throws during user creation", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockCreateUser.mockRejectedValue(new Error("duplicate userId"));

    const result = await createUserAction({ userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567" });
    expect(result).toEqual({ error: "Failed to create user. User ID or car number plate may already exist." });
  });
});

// -----------------------------------------------------------------------
// updateUserAction
// -----------------------------------------------------------------------
describe("updateUserAction", () => {
  const validInput = { userId: "user_xyz", carNumberPlate: "ABC123", mobileNumber: "+15551234567", isActive: true, isAdmin: false };

  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await updateUserAction(validInput);
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when caller is not an admin", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await updateUserAction(validInput);
    expect(result.error).toMatch(/admin/i);
  });

  it("updates the user successfully when called by an active admin", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    const updatedUser = makeUserInfo({ userId: "user_xyz", carNumberPlate: "ABC123" });
    mockUpdateUser.mockResolvedValue(updatedUser);

    const result = await updateUserAction(validInput);
    expect(result).toEqual({ success: true, data: updatedUser });
    expect(mockUpdateUser).toHaveBeenCalled();
  });

  it("returns error when the data layer throws during update", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockUpdateUser.mockRejectedValue(new Error("duplicate plate"));

    const result = await updateUserAction(validInput);
    expect(result).toEqual({ error: "Failed to update user. Car number plate may already exist." });
  });
});

// -----------------------------------------------------------------------
// deactivateUserAction
// -----------------------------------------------------------------------
describe("deactivateUserAction", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await deactivateUserAction("user_xyz");
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when caller is not an admin", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await deactivateUserAction("user_xyz");
    expect(result.error).toMatch(/admin/i);
  });

  it("deactivates the user successfully when called by an active admin", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockDeactivateUser.mockResolvedValue(undefined);

    const result = await deactivateUserAction("user_xyz");
    expect(result).toEqual({ success: true });
    expect(mockDeactivateUser).toHaveBeenCalledWith("user_xyz");
  });
});

// -----------------------------------------------------------------------
// activateUserAction
// -----------------------------------------------------------------------
describe("activateUserAction", () => {
  it("returns error when unauthenticated", async () => {
    mockAuthUserId.value = null;
    const result = await activateUserAction("user_xyz");
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns error when caller is not an admin", async () => {
    mockGetUserInfo.mockResolvedValue(activeUser({ isAdmin: false }));
    const result = await activateUserAction("user_xyz");
    expect(result.error).toMatch(/admin/i);
  });

  it("activates the user successfully when called by an active admin", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockActivateUser.mockResolvedValue(undefined);

    const result = await activateUserAction("user_xyz");
    expect(result).toEqual({ success: true });
    expect(mockActivateUser).toHaveBeenCalledWith("user_xyz");
  });
});

// Additional error-path tests for deactivate/activate
describe("deactivateUserAction — error path", () => {
  it("returns error when data layer throws during deactivation", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockDeactivateUser.mockRejectedValue(new Error("DB failure"));

    const result = await deactivateUserAction("user_xyz");
    expect(result).toEqual({ error: "Failed to deactivate user" });
  });
});

describe("activateUserAction — error path", () => {
  it("returns error when data layer throws during activation", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockActivateUser.mockRejectedValue(new Error("DB failure"));

    const result = await activateUserAction("user_xyz");
    expect(result).toEqual({ error: "Failed to activate user" });
  });
});

// -----------------------------------------------------------------------
// createSession — additional error paths (covers uncovered catch branches)
// -----------------------------------------------------------------------
describe("createSession — error paths", () => {
  it("returns error when cooldown check throws unexpectedly", async () => {
    mockCheckCooldownConstraint.mockRejectedValue(new Error("DB error"));
    const result = await createSession(validSessionInput());
    expect(result).toEqual({ error: "Failed to validate reservation cooldown" });
  });

  it("returns error when checkSessionOverlap throws unexpectedly", async () => {
    mockCheckSessionOverlap.mockRejectedValue(new Error("Network error"));
    const result = await createSession(validSessionInput());
    expect(result).toEqual({ error: "Failed to validate session timing" });
  });

  it("returns error when createLoadingSession throws", async () => {
    mockCreateLoadingSession.mockRejectedValue(new Error("DB write error"));
    const result = await createSession(validSessionInput());
    expect(result).toEqual({ error: "Failed to create charging session" });
  });
});

// -----------------------------------------------------------------------
// updateSession — additional error paths
// -----------------------------------------------------------------------
describe("updateSession — error paths", () => {
  function validUpdateInput() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(11, 0, 0, 0);
    return { id: 1, stationId: 1, startTime: tomorrow.toISOString(), endTime: end.toISOString() };
  }

  it("returns error when checkSessionOverlap throws unexpectedly", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "user_test123" }));
    mockCheckSessionOverlap.mockRejectedValue(new Error("Network error"));
    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ error: "Failed to validate session timing" });
  });

  it("returns error when updateLoadingSession throws", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "user_test123" }));
    mockUpdateLoadingSession.mockRejectedValue(new Error("DB write error"));
    const result = await updateSession(validUpdateInput());
    expect(result).toEqual({ error: "Failed to update charging session" });
  });
});

// -----------------------------------------------------------------------
// deleteSession — additional error paths
// -----------------------------------------------------------------------
describe("deleteSession — error paths", () => {
  it("returns error when deleteLoadingSession throws", async () => {
    mockGetSessionById.mockResolvedValue(makeSession({ userId: "user_test123" }));
    mockDeleteLoadingSession.mockRejectedValue(new Error("DB error"));
    const result = await deleteSession(1);
    expect(result).toEqual({ error: "Failed to delete charging session" });
  });
});

// -----------------------------------------------------------------------
// createStationAction — additional error paths
// -----------------------------------------------------------------------
describe("createStationAction — error paths", () => {
  it("returns error when createStation throws (e.g. duplicate name)", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockCreateStation.mockRejectedValue(new Error("Duplicate name"));
    const result = await createStationAction({ name: "Station X" });
    expect(result).toEqual({ error: "Failed to create station. Station name may already exist." });
  });
});

// -----------------------------------------------------------------------
// updateStationAction — additional error paths
// -----------------------------------------------------------------------
describe("updateStationAction — error paths", () => {
  it("returns error when updateStation throws (e.g. duplicate name)", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockGetStationById.mockResolvedValue(makeStation({ id: 1 }));
    mockUpdateStation.mockRejectedValue(new Error("Duplicate name"));
    const result = await updateStationAction({ id: 1, name: "Station X Updated" });
    expect(result).toEqual({ error: "Failed to update station. Station name may already exist." });
  });
});
