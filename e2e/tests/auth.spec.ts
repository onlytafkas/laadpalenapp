/**
 * Authentication E2E tests
 *
 * Verifies that the auth guards built into the Next.js app work correctly:
 *   1. Unauthenticated requests to /dashboard are redirected to /
 *   2. The home page is accessible to unauthenticated users and shows the
 *      sign-in CTA
 */
import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/home.page";
import { appVersionLabel } from "@/lib/version";

test.describe("Authentication guards", () => {
  test("unauthenticated visit to /dashboard redirects to the home page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // The app redirects unauthenticated users to /
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
  });

  test("home page is visible to unauthenticated users with Get Started CTA", async ({
    page,
  }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(
      page.getByRole("heading", { name: `Charging Stations App ${appVersionLabel}` })
    ).toBeVisible();
    await expect(home.getStartedButton).toBeVisible();
    await expect(home.startManagingButton).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
