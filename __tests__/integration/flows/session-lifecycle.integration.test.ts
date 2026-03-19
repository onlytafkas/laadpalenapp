/**
 * Cross-entity integration flow tests
 *
 * Validates end-to-end scenarios spanning multiple entities and action invocations:
 *   1. Admin creates station → admin creates user → user creates session
 *      → full audit trail is verified
 *   2. Admin deactivates user → deactivated user cannot create session
 *      → admin reactivates → user can book again
 *
 * Mocks only Clerk, next/headers, next/cache.
 * All data and DB operations run against real pg-mem.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const { mockUserId } = vi.hoisted(() => ({
  mockUserId: { value: "flow_admin" as string | null },
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

import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import {
  createStationAction,
  createUserAction,
  createSession,
  deactivateUserAction,
  activateUserAction,
} from "@/app/dashboard/actions";
import { getAllAuditLogs } from "@/data/audit";
import { createUser } from "@/data/usersinfo";
import { updateUser } from "@/data/usersinfo";

const ADMIN_ID = "flow_admin";
const REGULAR_USER_ID = "flow_regular";

let backup: ReturnType<typeof mem.backup>;

function isoToday(h: number, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

beforeAll(async () => {
  emptyBackup.restore();
  // Seed and promote admin
  await createUser({ userId: ADMIN_ID, carNumberPlate: "FL-ADM-001", mobileNumber: "+15550000010" });
  await updateUser({
    userId: ADMIN_ID,
    carNumberPlate: "FL-ADM-001",
    mobileNumber: "+15550000010",
    isActive: true,
    isAdmin: true,
  });
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
  mockUserId.value = ADMIN_ID;
});

// ── Flow 1: Full lifecycle with audit trail ────────────────────────────────────

describe("session lifecycle flow", () => {
  it("admin creates station + user, user books session — all three actions appear in audit log", async () => {
    // Admin creates a station
    const stationResult = await createStationAction({ name: "Flow Station" });
    expect(stationResult).toMatchObject({ success: true });
    const station = (stationResult as { success: true; data: { id: number } }).data;

    // Admin creates a user account
    const userResult = await createUserAction({
      userId: REGULAR_USER_ID,
      carNumberPlate: "FL-USR-001",
      mobileNumber: "+15550000011",
    });
    expect(userResult).toMatchObject({ success: true });

    // Switch to the regular user and create a session
    mockUserId.value = REGULAR_USER_ID;
    const sessionResult = await createSession({
      stationId: station.id,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });
    expect(sessionResult).toMatchObject({ success: true });

    // Verify audit trail contains all three events
    const logs = await getAllAuditLogs();
    const actions = logs.map((l) => l.action);

    expect(actions).toContain("CREATE_STATION");
    expect(actions).toContain("CREATE_USER");
    expect(actions).toContain("CREATE_SESSION");

    // All three should be successes
    const successLogs = logs.filter((l) => l.status === "success");
    expect(successLogs.length).toBeGreaterThanOrEqual(3);
  });

  it("audit log entries reference the correct entity ids", async () => {
    const stationResult = await createStationAction({ name: "Ref Station" });
    const station = (stationResult as { success: true; data: { id: number } }).data;

    await createUserAction({ userId: "ref_user", carNumberPlate: "RF-001", mobileNumber: "+15550000012" });

    mockUserId.value = "ref_user";
    const sessionResult = await createSession({
      stationId: station.id,
      startTime: isoToday(14),
      endTime: isoToday(15),
    });
    const session = (sessionResult as { success: true; data: { id: number } }).data;

    const logs = await getAllAuditLogs();

    const stationLog = logs.find(
      (l) => l.action === "CREATE_STATION" && l.status === "success"
    );
    expect(stationLog!.entityId).toBe(String(station.id));

    const sessionLog = logs.find(
      (l) => l.action === "CREATE_SESSION" && l.status === "success"
    );
    expect(sessionLog!.entityId).toBe(String(session.id));
  });
});

// ── Flow 2: Deactivate → reject → reactivate → allow ──────────────────────────

describe("user deactivation and reactivation flow", () => {
  it("deactivated user cannot book a session; after reactivation they can", async () => {
    // Admin creates station and user
    const stationResult = await createStationAction({ name: "Deact Flow Station" });
    const station = (stationResult as { success: true; data: { id: number } }).data;

    await createUserAction({ userId: "deact_flow_user", carNumberPlate: "DF-001", mobileNumber: "+15550000013" });

    // Admin deactivates the user
    const deactResult = await deactivateUserAction("deact_flow_user");
    expect(deactResult).toMatchObject({ success: true });

    // Deactivated user tries to book — should be rejected
    mockUserId.value = "deact_flow_user";
    const deniedResult = await createSession({
      stationId: station.id,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });
    expect(deniedResult).toMatchObject({
      error: expect.stringContaining("deactivated"),
    });

    // Admin reactivates the user
    mockUserId.value = ADMIN_ID;
    const reactResult = await activateUserAction("deact_flow_user");
    expect(reactResult).toMatchObject({ success: true });

    // User can now book
    mockUserId.value = "deact_flow_user";
    const allowedResult = await createSession({
      stationId: station.id,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });
    expect(allowedResult).toMatchObject({ success: true });
  });

  it("audit log captures the deactivation, rejection, and reactivation events", async () => {
    const stationResult = await createStationAction({ name: "Audit Flow Station" });
    const station = (stationResult as { success: true; data: { id: number } }).data;
    await createUserAction({ userId: "audit_flow_user", carNumberPlate: "AF-001", mobileNumber: "+15550000014" });

    await deactivateUserAction("audit_flow_user");

    mockUserId.value = "audit_flow_user";
    await createSession({
      stationId: station.id,
      startTime: isoToday(10),
      endTime: isoToday(11),
    });

    mockUserId.value = ADMIN_ID;
    await activateUserAction("audit_flow_user");

    const logs = await getAllAuditLogs();
    const actions = logs.map((l) => `${l.action}:${l.status}`);

    expect(actions).toContain("DEACTIVATE_USER:success");
    expect(actions).toContain("CREATE_SESSION:forbidden");
    expect(actions).toContain("ACTIVATE_USER:success");
  });
});
