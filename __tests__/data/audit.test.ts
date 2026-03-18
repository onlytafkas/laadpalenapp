import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// Mock @/db before importing the module under test
// Use vi.hoisted so variables are available inside the vi.mock factory.
// -----------------------------------------------------------------------
const { mockInsert, mockSelect } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}));

function chainWith(resolveWith: unknown) {
  const c: Record<string, unknown> = {};
  ["from", "where", "values", "returning", "orderBy"].forEach((m) => {
    c[m] = vi.fn(() => c);
  });
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveWith).then(resolve);
  return c;
}

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
}));

import { insertAuditLog, getAllAuditLogs } from "@/data/audit";
import { makeAuditLog } from "@/__tests__/helpers/factories";

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress expected console.error output in tests
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// -----------------------------------------------------------------------
// insertAuditLog
// -----------------------------------------------------------------------
describe("insertAuditLog", () => {
  it("inserts an audit log entry successfully", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values });

    await insertAuditLog({
      performedByUserId: "user_abc",
      action: "CREATE_SESSION",
      entityType: "session",
      status: "success",
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        performedByUserId: "user_abc",
        action: "CREATE_SESSION",
        entityType: "session",
        status: "success",
      })
    );
  });

  it("stores null for optional fields when not provided", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values });

    await insertAuditLog({
      performedByUserId: null,
      action: "DELETE_SESSION",
      entityType: "session",
      status: "unauthorized",
    });

    const insertedValues = values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.entityId).toBeNull();
    expect(insertedValues.errorMessage).toBeNull();
    expect(insertedValues.beforeData).toBeNull();
    expect(insertedValues.afterData).toBeNull();
    expect(insertedValues.ipAddress).toBeNull();
    expect(insertedValues.userAgent).toBeNull();
  });

  it("does NOT throw when the database insert fails (error is silenced)", async () => {
    const values = vi.fn().mockRejectedValue(new Error("DB connection failed"));
    mockInsert.mockReturnValue({ values });

    // Should resolve without throwing
    await expect(
      insertAuditLog({
        performedByUserId: "user_abc",
        action: "CREATE_SESSION",
        entityType: "session",
        status: "error",
      })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });

  it("stores beforeData and afterData as provided", async () => {
    const before = { id: 1, name: "old" };
    const after = { id: 1, name: "new" };

    const values = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values });

    await insertAuditLog({
      performedByUserId: "user_abc",
      action: "UPDATE_STATION",
      entityType: "station",
      status: "success",
      beforeData: before,
      afterData: after,
    });

    const insertedValues = values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.beforeData).toEqual(before);
    expect(insertedValues.afterData).toEqual(after);
  });
});

// -----------------------------------------------------------------------
// getAllAuditLogs
// -----------------------------------------------------------------------
describe("getAllAuditLogs", () => {
  it("returns all audit logs ordered by createdAt descending", async () => {
    const logs = [
      makeAuditLog({ id: 2, createdAt: new Date("2026-03-18T11:00:00Z") }),
      makeAuditLog({ id: 1, createdAt: new Date("2026-03-18T10:00:00Z") }),
    ];
    mockSelect.mockReturnValue(chainWith(logs));

    const result = await getAllAuditLogs();
    expect(result).toEqual(logs);
    expect(mockSelect).toHaveBeenCalled();
  });
});
