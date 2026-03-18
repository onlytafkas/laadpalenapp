import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// Mock @/db before importing the module under test
// Use vi.hoisted so variables are available inside the vi.mock factory.
// -----------------------------------------------------------------------
const { mockSelect, mockInsert, mockUpdate, mockDelete, mockFindMany } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockFindMany: vi.fn(),
}));

function chainWith(resolveWith: unknown) {
  const c: Record<string, unknown> = {};
  ["from", "where", "set", "values", "returning", "orderBy", "limit"].forEach((m) => {
    c[m] = vi.fn(() => c);
  });
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveWith).then(resolve);
  return c;
}

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    query: {
      sessions: { findMany: mockFindMany },
    },
  },
}));

import {
  getAllStations,
  createStation,
  updateStation,
  deleteStation,
  checkStationHasSessions,
  getStationById,
} from "@/data/stations";
import { makeStation } from "@/__tests__/helpers/factories";

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------
// getAllStations
// -----------------------------------------------------------------------
describe("getAllStations", () => {
  it("returns all stations ordered by name", async () => {
    const stations = [makeStation({ id: 1, name: "Alpha" }), makeStation({ id: 2, name: "Beta" })];
    mockSelect.mockReturnValue(chainWith(stations));

    const result = await getAllStations();
    expect(result).toEqual(stations);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns an empty array when no stations exist", async () => {
    mockSelect.mockReturnValue(chainWith([]));
    const result = await getAllStations();
    expect(result).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// createStation
// -----------------------------------------------------------------------
describe("createStation", () => {
  it("inserts a new station and returns it", async () => {
    const station = makeStation({ id: 5, name: "New Station", description: "Fast charger" });

    const returning = vi.fn().mockResolvedValue([station]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    const result = await createStation({ name: "New Station", description: "Fast charger" });
    expect(result).toEqual(station);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Station", description: "Fast charger" })
    );
  });

  it("stores null for description when not provided", async () => {
    const station = makeStation({ name: "Minimal" });

    const returning = vi.fn().mockResolvedValue([station]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    await createStation({ name: "Minimal" });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ description: null })
    );
  });
});

// -----------------------------------------------------------------------
// updateStation
// -----------------------------------------------------------------------
describe("updateStation", () => {
  it("updates the station and returns the updated record", async () => {
    const updated = makeStation({ id: 1, name: "Updated", description: "Changed" });

    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const result = await updateStation({ id: 1, name: "Updated", description: "Changed" });
    expect(result).toEqual(updated);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated", description: "Changed" })
    );
  });

  it("stores null for description when not provided", async () => {
    const updated = makeStation({ id: 1, name: "No Desc", description: null });

    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    await updateStation({ id: 1, name: "No Desc" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ description: null })
    );
  });
});

// -----------------------------------------------------------------------
// deleteStation
// -----------------------------------------------------------------------
describe("deleteStation", () => {
  it("calls db.delete with the correct station id", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where });

    await deleteStation(3);
    expect(mockDelete).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// checkStationHasSessions
// -----------------------------------------------------------------------
describe("checkStationHasSessions", () => {
  it("returns false when there are no sessions for the station", async () => {
    mockSelect.mockReturnValue(chainWith([{ count: 0 }]));
    const result = await checkStationHasSessions(1);
    expect(result).toBe(false);
  });

  it("returns true when at least one session exists for the station", async () => {
    mockSelect.mockReturnValue(chainWith([{ count: 3 }]));
    const result = await checkStationHasSessions(1);
    expect(result).toBe(true);
  });
});

// -----------------------------------------------------------------------
// getStationById
// -----------------------------------------------------------------------
describe("getStationById", () => {
  it("returns the station when found", async () => {
    const station = makeStation({ id: 7, name: "Lucky Seven" });
    mockSelect.mockReturnValue(chainWith([station]));
    const result = await getStationById(7);
    expect(result).toEqual(station);
  });

  it("returns undefined when station is not found", async () => {
    mockSelect.mockReturnValue(chainWith([]));
    const result = await getStationById(999);
    expect(result).toBeNull();
  });
});
