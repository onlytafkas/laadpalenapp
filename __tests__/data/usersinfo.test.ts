import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// Mock @/db before importing the module under test
// Use vi.hoisted so variables are available inside the vi.mock factory.
// -----------------------------------------------------------------------
const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
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
  },
}));

import {
  getAllUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  getUserInfo,
  checkUserHasSessions,
} from "@/data/usersinfo";
import { makeUserInfo } from "@/__tests__/helpers/factories";

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------
// getAllUsers
// -----------------------------------------------------------------------
describe("getAllUsers", () => {
  it("returns all users", async () => {
    const users = [makeUserInfo({ userId: "u1" }), makeUserInfo({ userId: "u2" })];
    mockSelect.mockReturnValue(chainWith(users));
    const result = await getAllUsers();
    expect(result).toEqual(users);
  });
});

// -----------------------------------------------------------------------
// createUser
// -----------------------------------------------------------------------
describe("createUser", () => {
  it("inserts the user with default isActive=true and isAdmin=false", async () => {
    const created = makeUserInfo();

    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    const result = await createUser({ userId: "user_test123", carNumberPlate: "ABC-1234" });
    expect(result).toEqual(created);

    const insertedValues = values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.isActive).toBe(true);
  });

  it("respects the isActive override", async () => {
    const created = makeUserInfo({ isActive: false });

    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    await createUser({ userId: "user_test123", carNumberPlate: "ABC-1234", isActive: false });

    const insertedValues = values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.isActive).toBe(false);
  });
});

// -----------------------------------------------------------------------
// updateUser
// -----------------------------------------------------------------------
describe("updateUser", () => {
  it("updates user fields and returns the updated record", async () => {
    const updated = makeUserInfo({ carNumberPlate: "XYZ-9999", isAdmin: true });

    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const result = await updateUser({
      userId: "user_test123",
      carNumberPlate: "XYZ-9999",
      isActive: true,
      isAdmin: true,
    });

    expect(result).toEqual(updated);
    const setArgs = set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArgs.carNumberPlate).toBe("XYZ-9999");
    expect(setArgs.isAdmin).toBe(true);
  });
});

// -----------------------------------------------------------------------
// deactivateUser
// -----------------------------------------------------------------------
describe("deactivateUser", () => {
  it("sets isActive=false on the user", async () => {
    const deactivated = makeUserInfo({ isActive: false });

    const returning = vi.fn().mockResolvedValue([deactivated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const result = await deactivateUser("user_test123");
    expect(result.isActive).toBe(false);

    const setArgs = set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArgs.isActive).toBe(false);
  });
});

// -----------------------------------------------------------------------
// activateUser
// -----------------------------------------------------------------------
describe("activateUser", () => {
  it("sets isActive=true on the user", async () => {
    const activated = makeUserInfo({ isActive: true });

    const returning = vi.fn().mockResolvedValue([activated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const result = await activateUser("user_test123");
    expect(result.isActive).toBe(true);

    const setArgs = set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArgs.isActive).toBe(true);
  });
});

// -----------------------------------------------------------------------
// getUserInfo
// -----------------------------------------------------------------------
describe("getUserInfo", () => {
  it("returns the user when found", async () => {
    const user = makeUserInfo({ userId: "user_abc" });
    mockSelect.mockReturnValue(chainWith([user]));
    const result = await getUserInfo("user_abc");
    expect(result).toEqual(user);
  });

  it("returns null when user is not found", async () => {
    mockSelect.mockReturnValue(chainWith([]));
    const result = await getUserInfo("nonexistent");
    expect(result).toBeNull();
  });
});

// -----------------------------------------------------------------------
// checkUserHasSessions
// -----------------------------------------------------------------------
describe("checkUserHasSessions", () => {
  it("returns false when user has no sessions", async () => {
    mockSelect.mockReturnValue(chainWith([{ count: 0 }]));
    const result = await checkUserHasSessions("user_abc");
    expect(result).toBe(false);
  });

  it("returns true when user has sessions", async () => {
    mockSelect.mockReturnValue(chainWith([{ count: 2 }]));
    const result = await checkUserHasSessions("user_abc");
    expect(result).toBe(true);
  });
});
