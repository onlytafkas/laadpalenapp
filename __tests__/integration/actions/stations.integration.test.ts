/**
 * Integration tests for station server actions (app/dashboard/actions.ts)
 *
 * Mocks only infrastructure (Clerk, next/headers, next/cache).
 * Data layer and @/db are REAL — running against pg-mem.
 *
 * This validates the full stack: auth check → permission check → DB write → audit log.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// 1. Hoist mock control vars before any imports
const { mockUserId } = vi.hoisted(() => ({
  mockUserId: { value: "admin_user" as string | null },
}));

// 2. Mock infrastructure only
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

// 3. Import after mocks
import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import {
  createStationAction,
  updateStationAction,
  deleteStationAction,
} from "@/app/dashboard/actions";
import { createUser, getUserInfo } from "@/data/usersinfo";
import { createStation, getAllStations } from "@/data/stations";
import { createLoadingSession } from "@/data/loading-sessions";
import { getAllAuditLogs } from "@/data/audit";

const ADMIN_ID = "admin_user";
const REGULAR_USER_ID = "regular_user";

let backup: ReturnType<typeof mem.backup>;

beforeAll(async () => {
  emptyBackup.restore();
  // Seed an admin user and a regular user
  await createUser({ userId: ADMIN_ID, carNumberPlate: "ADM-001", mobileNumber: "+15550000020" });
  await updateUserToAdmin(ADMIN_ID);
  await createUser({ userId: REGULAR_USER_ID, carNumberPlate: "REG-001", mobileNumber: "+15550000021" });

  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
  mockUserId.value = ADMIN_ID; // default: logged in as admin
});

/** Helper: promote a user to admin by updating the record directly */
async function updateUserToAdmin(userId: string) {
  const { updateUser } = await import("@/data/usersinfo");
  const user = await getUserInfo(userId);
  if (!user) return;
  await updateUser({
    userId,
    carNumberPlate: user.carNumberPlate,
    mobileNumber: user.mobileNumber,
    isActive: true,
    isAdmin: true,
  });
}

// ── createStationAction ────────────────────────────────────────────────────────

describe("createStationAction", () => {
  it("returns Unauthorized when no user is authenticated", async () => {
    mockUserId.value = null;

    const result = await createStationAction({ name: "Station X" });

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Forbidden when the authenticated user is not an admin", async () => {
    mockUserId.value = REGULAR_USER_ID;

    const result = await createStationAction({ name: "Station X" });

    expect(result).toEqual({ error: "Forbidden: Admin access required" });
  });

  it("creates the station in the database and returns it on success", async () => {
    const result = await createStationAction({
      name: "New Integration Station",
      description: "Created via action",
    });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({ name: "New Integration Station" }),
    });

    // Verify it actually persisted
    const stations = await getAllStations();
    expect(stations.some((s) => s.name === "New Integration Station")).toBe(true);
  });

  it("writes a success audit log entry after creating a station", async () => {
    await createStationAction({ name: "Audited Station" });

    const logs = await getAllAuditLogs();
    const log = logs.find((l) => l.action === "CREATE_STATION" && l.status === "success");

    expect(log).toBeDefined();
    expect(log!.performedByUserId).toBe(ADMIN_ID);
    expect(log!.entityType).toBe("station");
  });

  it("returns an error and writes an audit log when the station name is a duplicate", async () => {
    // Silence the expected console.error emitted by the action's catch block
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await createStationAction({ name: "Dup Station" });

    // Second attempt with same name hits DB UNIQUE constraint
    const result = await createStationAction({ name: "Dup Station" });
    consoleSpy.mockRestore();

    expect(result).toEqual({
      error: "Failed to create station. Station name may already exist.",
    });

    const logs = await getAllAuditLogs();
    const errorLog = logs.find(
      (l) => l.action === "CREATE_STATION" && l.status === "error"
    );
    expect(errorLog).toBeDefined();
  });

  it("returns a validation error for an empty station name", async () => {
    const result = await createStationAction({ name: "" });

    expect(result).toMatchObject({ error: expect.stringContaining("required") });
  });
});

// ── updateStationAction ────────────────────────────────────────────────────────

describe("updateStationAction", () => {
  it("returns Unauthorized when not logged in", async () => {
    mockUserId.value = null;
    const station = await createStation({ name: "Update Target" });

    const result = await updateStationAction({ id: station.id, name: "New Name" });

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Forbidden for a non-admin user", async () => {
    mockUserId.value = REGULAR_USER_ID;
    const station = await createStation({ name: "Update Target 2" });

    const result = await updateStationAction({ id: station.id, name: "New Name" });

    expect(result).toEqual({ error: "Forbidden: Admin access required" });
  });

  it("updates the station and returns the new data", async () => {
    const station = await createStation({ name: "Old Station Name" });

    const result = await updateStationAction({
      id: station.id,
      name: "Updated Station Name",
      description: "New description",
    });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({ name: "Updated Station Name" }),
    });
  });

  it("writes a success audit log with beforeData and afterData", async () => {
    const station = await createStation({ name: "Before Update" });

    await updateStationAction({ id: station.id, name: "After Update" });

    const logs = await getAllAuditLogs();
    const log = logs.find((l) => l.action === "UPDATE_STATION" && l.status === "success");

    expect(log).toBeDefined();
    expect((log!.afterData as { name: string }).name).toBe("After Update");
  });
});

// ── deleteStationAction ────────────────────────────────────────────────────────

describe("deleteStationAction", () => {
  it("returns Unauthorized when not logged in", async () => {
    mockUserId.value = null;
    const result = await deleteStationAction(1);
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Forbidden for a non-admin user", async () => {
    mockUserId.value = REGULAR_USER_ID;
    const result = await deleteStationAction(1);
    expect(result).toEqual({ error: "Forbidden: Admin access required" });
  });

  it("returns an error when the station does not exist", async () => {
    const result = await deleteStationAction(99999);
    expect(result).toEqual({ error: "Station not found" });
  });

  it("returns an error and does not delete when the station has sessions", async () => {
    const station = await createStation({ name: "Station With Sessions" });
    await createLoadingSession({
      userId: REGULAR_USER_ID,
      stationId: station.id,
      startTime: new Date("2026-03-18T10:00:00Z").toISOString(),
    });

    const result = await deleteStationAction(station.id);

    expect(result).toEqual({
      error: "Cannot delete station with existing reservations",
    });

    // Station must still be in the DB
    const stations = await getAllStations();
    expect(stations.some((s) => s.id === station.id)).toBe(true);
  });

  it("deletes an empty station and writes a success audit log", async () => {
    const station = await createStation({ name: "Deleteable Station" });

    const result = await deleteStationAction(station.id);

    expect(result).toEqual({ success: true });

    const stations = await getAllStations();
    expect(stations.some((s) => s.id === station.id)).toBe(false);

    const logs = await getAllAuditLogs();
    const log = logs.find((l) => l.action === "DELETE_STATION" && l.status === "success");
    expect(log).toBeDefined();
    expect(log!.entityId).toBe(String(station.id));
  });
});
