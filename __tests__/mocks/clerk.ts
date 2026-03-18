import { vi } from "vitest";

/** Default authenticated user ID used across tests. */
export const MOCK_USER_ID = "user_test123";

let _userId: string | null = MOCK_USER_ID;

export function setAuthUserId(id: string | null) {
  _userId = id;
}

export function resetAuth() {
  _userId = MOCK_USER_ID;
}

// ---------------------------------------------------------------------------
// Mock for @clerk/nextjs/server
// ---------------------------------------------------------------------------
export const auth = vi.fn(async () => ({ userId: _userId }));

export const clerkMockModule = {
  auth,
};
