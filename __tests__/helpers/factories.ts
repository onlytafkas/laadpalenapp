/**
 * Typed fixture factories for test data.
 * Fill in optional fields via the overrides parameter.
 */

export function makeStation(overrides: Partial<{
  id: number;
  name: string;
  description: string | null;
}> = {}) {
  return {
    id: 1,
    name: "Station A",
    description: null,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<{
  id: number;
  userId: string;
  stationId: number;
  startTime: Date;
  endTime: Date | null;
}> = {}) {
  return {
    id: 1,
    userId: "user_test123",
    stationId: 1,
    startTime: new Date("2026-03-18T10:00:00.000Z"),
    endTime: new Date("2026-03-18T11:00:00.000Z"),
    ...overrides,
  };
}

export function makeUserInfo(overrides: Partial<{
  userId: string;
  carNumberPlate: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    userId: "user_test123",
    carNumberPlate: "ABC-1234",
    isActive: true,
    isAdmin: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function makeAuditLog(overrides: Partial<{
  id: number;
  performedByUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  status: string;
  errorMessage: string | null;
  beforeData: unknown;
  afterData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}> = {}) {
  return {
    id: 1,
    performedByUserId: "user_test123",
    action: "CREATE_SESSION",
    entityType: "session",
    entityId: "1",
    status: "success",
    errorMessage: null,
    beforeData: null,
    afterData: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date("2026-03-18T10:00:00.000Z"),
    ...overrides,
  };
}
