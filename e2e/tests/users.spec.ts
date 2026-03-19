/**
 * User management E2E tests (admin only)
 *
 * Verifies:
 *   1. Admin can create a new user (by Clerk user ID + car plate) and the entry
 *      appears in the Users tab
 *   2. Admin can deactivate a user — the "Inactive" badge becomes visible
 *   3. Admin can reactivate a user — the "Inactive" badge is removed
 *
 * The created user uses a Clerk user ID that is known to exist in Clerk.
 * For the toggle tests we use the E2E_REGULAR_USER seeded in global-setup.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";
import { DashboardPage } from "../pages/dashboard.page";
import { UserPage } from "../pages/user.page";

// Use the seeded regular user for toggle tests
const REGULAR_USER_ID =
  process.env.E2E_REGULAR_USER_ID ?? "user_e2e_regular";

// A second test-only user that we create via the dialog
// (must be a valid Clerk user ID that exists in your Clerk instance)
const NEW_USER_ID = process.env.E2E_NEW_USER_ID ?? "user_e2e_new";
const NEW_USER_PLATE = "E2E-NEW-001";

test.describe("User management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    const dashboard = new DashboardPage(page);
    await dashboard.gotoTab("users");
    await page.waitForTimeout(500);
  });

  test("admin can create a user and it appears in the Users tab", async ({
    page,
  }) => {
    const userPage = new UserPage(page);

    await userPage.clickAddUser();
    await userPage.fillCreateUser(NEW_USER_ID, NEW_USER_PLATE);
    await userPage.submitCreate();

    await expect(
      page.getByRole("dialog", { name: "Add New User" })
    ).not.toBeVisible();

    // The car plate is the most stable identifier visible in the user card
    await expect(page.getByText(NEW_USER_PLATE)).toBeVisible();
  });

  test("admin can deactivate a user and the Inactive badge appears", async ({
    page,
  }) => {
    const userPage = new UserPage(page);

    await userPage.clickDeactivate(REGULAR_USER_ID);
    await userPage.confirmDeactivate();

    await expect(
      page.getByRole("dialog", { name: "Deactivate User" })
    ).not.toBeVisible();

    // The user card should now show an "Inactive" badge
    await expect(page.getByText("Inactive").first()).toBeVisible();
  });

  test("admin can reactivate a user and the Inactive badge is removed", async ({
    page,
  }) => {
    const userPage = new UserPage(page);

    // First ensure the user is deactivated (may already be from the previous test)
    const inactiveBadge = page.getByText("Inactive").first();
    const alreadyInactive = await inactiveBadge
      .isVisible()
      .catch(() => false);

    if (!alreadyInactive) {
      await userPage.clickDeactivate(REGULAR_USER_ID);
      await userPage.confirmDeactivate();
      await expect(inactiveBadge).toBeVisible();
    }

    // Now reactivate
    await userPage.clickActivate(REGULAR_USER_ID);
    await userPage.confirmActivate();

    await expect(
      page.getByRole("dialog", { name: "Activate User" })
    ).not.toBeVisible();

    // "Inactive" badge for this user should no longer be present
    await expect(page.getByText("Inactive")).not.toBeVisible();
  });
});
