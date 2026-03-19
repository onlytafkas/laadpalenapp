import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";
import { assertSafePlaywrightE2EEnvironment } from "./e2e/helpers/safety";

// Load test-only env vars from .env.e2e.local (never the dev .env.local)
dotenv.config({ path: path.resolve(__dirname, ".env.e2e.local") });

const { databaseUrl } = assertSafePlaywrightE2EEnvironment();

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false, // sequential to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // single worker — all tests share one seeded DB state
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  webServer: [
    {
      command: "npx tsx scripts/mock-twilio-server.ts",
      url: "http://127.0.0.1:4010/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        // Override DATABASE_URL so Next.js server uses the test DB, not the dev DB
        DATABASE_URL: databaseUrl,
        E2E_SERVER: "true",
        TWILIO_API_BASE_URL: "http://127.0.0.1:4010",
        TWILIO_ACCOUNT_SID: "AC_E2E_TEST",
        TWILIO_AUTH_TOKEN: "e2e-auth-token",
        TWILIO_FROM_NUMBER: "+15550009999",
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      },
    },
  ],
});
