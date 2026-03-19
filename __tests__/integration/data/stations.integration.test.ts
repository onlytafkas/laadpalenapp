/**
 * Integration tests for data/stations.ts
 *
 * Runs real Drizzle queries against an in-memory PostgreSQL (pg-mem).
 * Unlike unit tests, these validate the actual SQL, UNIQUE constraints,
 * ordering, and relationship queries.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// 1. Mock @/db to use the in-memory test database (must come before data imports)
vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));

// 2. Import test-db for backup/restore between tests
import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";

// 3. Import the module under test (real implementation, real Drizzle)
import {
  getAllStations,
  createStation,
  updateStation,
  deleteStation,
  getStationById,
  checkStationHasSessions,
} from "@/data/stations";
import { createLoadingSession } from "@/data/loading-sessions";
import { createUser } from "@/data/usersinfo";

let backup: ReturnType<typeof mem.backup>;

beforeAll(() => {
  emptyBackup.restore(); // guarantee clean slate regardless of test file order
  backup = mem.backup();
});

afterAll(() => {
  emptyBackup.restore();
});

beforeEach(() => {
  backup.restore();
});

// ── getAllStations ──────────────────────────────────────────────────────────

describe("getAllStations", () => {
  it("returns an empty array when no stations exist", async () => {
    expect(await getAllStations()).toEqual([]);
  });

  it("returns all stations ordered alphabetically by name", async () => {
    await createStation({ name: "Zeta Station" });
    await createStation({ name: "Alpha Station" });
    await createStation({ name: "Mu Station" });

    const stations = await getAllStations();

    expect(stations.map((s) => s.name)).toEqual([
      "Alpha Station",
      "Mu Station",
      "Zeta Station",
    ]);
  });
});

// ── createStation ───────────────────────────────────────────────────────────

describe("createStation", () => {
  it("creates a station with just a name and stores null description", async () => {
    const station = await createStation({ name: "Station A" });

    expect(station.id).toBeTypeOf("number");
    expect(station.name).toBe("Station A");
    expect(station.description).toBeNull();
  });

  it("creates a station with a description", async () => {
    const station = await createStation({
      name: "Station B",
      description: "Near the entrance",
    });

    expect(station.description).toBe("Near the entrance");
  });

  it("stores an empty string description as null", async () => {
    // The data function converts falsy description → null
    const station = await createStation({ name: "Station C", description: "" });
    expect(station.description).toBeNull();
  });

  it("throws when a station with the same name is inserted twice (UNIQUE constraint)", async () => {
    await createStation({ name: "Duplicate" });

    await expect(createStation({ name: "Duplicate" })).rejects.toThrow();
  });

  it("auto-increments ids across inserts", async () => {
    const a = await createStation({ name: "First" });
    const b = await createStation({ name: "Second" });

    expect(b.id).toBeGreaterThan(a.id);
  });
});

// ── getStationById ──────────────────────────────────────────────────────────

describe("getStationById", () => {
  it("returns the station when it exists", async () => {
    const created = await createStation({ name: "Find Me" });

    const found = await getStationById(created.id);

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find Me");
  });

  it("returns null when the station does not exist", async () => {
    expect(await getStationById(99999)).toBeNull();
  });
});

// ── updateStation ───────────────────────────────────────────────────────────

describe("updateStation", () => {
  it("updates the name and description of an existing station", async () => {
    const station = await createStation({
      name: "Old Name",
      description: "Old desc",
    });

    const updated = await updateStation({
      id: station.id,
      name: "New Name",
      description: "New desc",
    });

    expect(updated.name).toBe("New Name");
    expect(updated.description).toBe("New desc");
  });

  it("can clear the description by passing empty string (stored as null)", async () => {
    const station = await createStation({
      name: "With Desc",
      description: "Some desc",
    });

    const updated = await updateStation({
      id: station.id,
      name: "With Desc",
      description: "",
    });

    expect(updated.description).toBeNull();
  });

  it("persists changes — subsequent getStationById reflects update", async () => {
    const station = await createStation({ name: "Before" });
    await updateStation({ id: station.id, name: "After" });

    const refetched = await getStationById(station.id);
    expect(refetched!.name).toBe("After");
  });
});

// ── deleteStation ───────────────────────────────────────────────────────────

describe("deleteStation", () => {
  it("removes the station from the database", async () => {
    const station = await createStation({ name: "To Delete" });

    await deleteStation(station.id);

    expect(await getStationById(station.id)).toBeNull();
  });

  it("does not throw when deleting a non-existent station id", async () => {
    await expect(deleteStation(99999)).resolves.toBeUndefined();
  });
});

// ── checkStationHasSessions ─────────────────────────────────────────────────

describe("checkStationHasSessions", () => {
  it("returns false when the station has no sessions", async () => {
    const station = await createStation({ name: "Empty Station" });

    expect(await checkStationHasSessions(station.id)).toBe(false);
  });

  it("returns true after a session is linked to the station", async () => {
    const station = await createStation({ name: "Busy Station" });
    await createUser({ userId: "user_s1", carNumberPlate: "XX-001", mobileNumber: "+15550000040" });
    await createLoadingSession({
      userId: "user_s1",
      stationId: station.id,
      startTime: new Date("2026-03-18T10:00:00Z").toISOString(),
    });

    expect(await checkStationHasSessions(station.id)).toBe(true);
  });
});
