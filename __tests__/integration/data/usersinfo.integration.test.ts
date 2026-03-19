/**
 * Integration tests for data/usersinfo.ts
 *
 * Runs real Drizzle queries against an in-memory PostgreSQL (pg-mem).
 * Verifies default column values, UNIQUE constraints, and toggle operations.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));

import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";
import {
  getAllUsers,
  createUser,
  getUserInfo,
  updateUser,
  deactivateUser,
  activateUser,
  checkUserHasSessions,
} from "@/data/usersinfo";
import { createStation } from "@/data/stations";
import { createLoadingSession } from "@/data/loading-sessions";

let backup: ReturnType<typeof mem.backup>;

beforeAll(() => {
  emptyBackup.restore();
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
});

// ── getAllUsers ──────────────────────────────────────────────────────────────

describe("getAllUsers", () => {
  it("returns empty array when no users exist", async () => {
    expect(await getAllUsers()).toEqual([]);
  });

  it("returns all users ordered by userId ascending", async () => {
    await createUser({ userId: "user_z", carNumberPlate: "ZZ-001", mobileNumber: "+15550000002" });
    await createUser({ userId: "user_a", carNumberPlate: "AA-001", mobileNumber: "+15550000001" });

    const users = await getAllUsers();

    expect(users[0].userId).toBe("user_a");
    expect(users[1].userId).toBe("user_z");
  });
});

// ── createUser ───────────────────────────────────────────────────────────────

describe("createUser", () => {
  it("creates a user with default isActive=true and isAdmin=false", async () => {
    const user = await createUser({
      userId: "user_defaults",
      carNumberPlate: "DF-001",
      mobileNumber: "+15550000100",
    });

    expect(user.userId).toBe("user_defaults");
    expect(user.carNumberPlate).toBe("DF-001");
    expect(user.mobileNumber).toBe("+15550000100");
    expect(user.isActive).toBe(true);
    expect(user.isAdmin).toBe(false);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("respects an explicit isActive=false override", async () => {
    const user = await createUser({
      userId: "user_inactive",
      carNumberPlate: "IN-001",
      mobileNumber: "+15550000101",
      isActive: false,
    });

    expect(user.isActive).toBe(false);
  });

  it("allows a legacy user row with no mobile number", async () => {
    const user = await createUser({
      userId: "user_legacy",
      carNumberPlate: "LG-001",
    });

    expect(user.mobileNumber).toBeNull();
  });

  it("throws when the same userId is inserted twice (PK constraint)", async () => {
    await createUser({ userId: "user_dup", carNumberPlate: "PK-001", mobileNumber: "+15550000102" });

    await expect(
      createUser({ userId: "user_dup", carNumberPlate: "PK-002", mobileNumber: "+15550000103" })
    ).rejects.toThrow();
  });

  it("throws when the same carNumberPlate is inserted twice (UNIQUE constraint)", async () => {
    await createUser({ userId: "user_u1", carNumberPlate: "SAME-PLATE", mobileNumber: "+15550000104" });

    await expect(
      createUser({ userId: "user_u2", carNumberPlate: "SAME-PLATE", mobileNumber: "+15550000105" })
    ).rejects.toThrow();
  });
});

// ── getUserInfo ───────────────────────────────────────────────────────────────

describe("getUserInfo", () => {
  it("returns the user when found", async () => {
    await createUser({ userId: "user_find", carNumberPlate: "FN-001", mobileNumber: "+15550000106" });

    const user = await getUserInfo("user_find");

    expect(user).not.toBeNull();
    expect(user!.carNumberPlate).toBe("FN-001");
  });

  it("returns null for a non-existent userId", async () => {
    expect(await getUserInfo("no_such_user")).toBeNull();
  });
});

// ── updateUser ────────────────────────────────────────────────────────────────

describe("updateUser", () => {
  it("updates carNumberPlate, isActive, and isAdmin fields", async () => {
    await createUser({ userId: "user_upd", carNumberPlate: "OLD-001", mobileNumber: "+15550000107" });

    const updated = await updateUser({
      userId: "user_upd",
      carNumberPlate: "NEW-001",
      mobileNumber: "+15550000999",
      isActive: false,
      isAdmin: true,
    });

    expect(updated.carNumberPlate).toBe("NEW-001");
    expect(updated.mobileNumber).toBe("+15550000999");
    expect(updated.isActive).toBe(false);
    expect(updated.isAdmin).toBe(true);
  });

  it("persists changes — getUserInfo reflects the update", async () => {
    await createUser({ userId: "user_persist", carNumberPlate: "PR-001", mobileNumber: "+15550000108" });
    await updateUser({
      userId: "user_persist",
      carNumberPlate: "PR-002",
      mobileNumber: "+15550000109",
      isActive: true,
      isAdmin: true,
    });

    const refetched = await getUserInfo("user_persist");
    expect(refetched!.isAdmin).toBe(true);
    expect(refetched!.carNumberPlate).toBe("PR-002");
    expect(refetched!.mobileNumber).toBe("+15550000109");
  });
});

// ── deactivateUser / activateUser ─────────────────────────────────────────────

describe("deactivateUser", () => {
  it("sets isActive to false for an active user", async () => {
    await createUser({ userId: "user_deact", carNumberPlate: "DA-001", mobileNumber: "+15550000110" });

    const result = await deactivateUser("user_deact");

    expect(result.isActive).toBe(false);
  });
});

describe("activateUser", () => {
  it("sets isActive to true for a deactivated user", async () => {
    await createUser({
      userId: "user_act",
      carNumberPlate: "AC-001",
      mobileNumber: "+15550000111",
      isActive: false,
    });

    const result = await activateUser("user_act");

    expect(result.isActive).toBe(true);
  });

  it("idempotent — activating an already-active user keeps isActive true", async () => {
    await createUser({ userId: "user_idem", carNumberPlate: "ID-001", mobileNumber: "+15550000112" });

    const result = await activateUser("user_idem");

    expect(result.isActive).toBe(true);
  });
});

// ── checkUserHasSessions ──────────────────────────────────────────────────────

describe("checkUserHasSessions", () => {
  it("returns false when the user has no sessions", async () => {
    await createUser({ userId: "user_nosess", carNumberPlate: "NS-001", mobileNumber: "+15550000113" });

    expect(await checkUserHasSessions("user_nosess")).toBe(false);
  });

  it("returns true after a session is created for the user", async () => {
    await createUser({ userId: "user_hassess", carNumberPlate: "HS-001", mobileNumber: "+15550000114" });
    const station = await createStation({ name: "Sess Station" });
    await createLoadingSession({
      userId: "user_hassess",
      stationId: station.id,
      startTime: new Date("2026-03-18T10:00:00Z").toISOString(),
    });

    expect(await checkUserHasSessions("user_hassess")).toBe(true);
  });
});
