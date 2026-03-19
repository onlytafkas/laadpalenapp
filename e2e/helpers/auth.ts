/**
 * E2E authentication helpers
 *
 * Uses Clerk's testing helpers to sign in without going through the UI:
 *   1. `setupClerkTestingToken({ page })` — bypasses Clerk bot-detection
 *   2. `clerk.signIn({ page, emailAddress })` — finds the user by email,
 *      creates a short-lived sign-in token via Clerk's backend API (ticket
 *      strategy), and completes sign-in without touching the UI form.
 *
 * Prerequisites:
 *   - CLERK_SECRET_KEY must be set in .env.e2e.local
 *   - E2E_ADMIN_EMAIL and E2E_REGULAR_EMAIL must map to real Clerk accounts
 *   - clerkSetup() must have been called in global-setup.ts
 */
import { type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const E2E_REGULAR_EMAIL = process.env.E2E_REGULAR_EMAIL ?? "";

/**
 * Sign in as the E2E admin user and navigate to /dashboard.
 * The admin is seeded with isAdmin=true, isActive=true in global-setup.ts.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_ADMIN_EMAIL });
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
}

/**
 * Sign in as the E2E regular user and navigate to /dashboard.
 * The regular user is seeded with isAdmin=false, isActive=true.
 */
export async function loginAsUser(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_REGULAR_EMAIL });
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
}
