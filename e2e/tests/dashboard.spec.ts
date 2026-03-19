/**
 * Dashboard rendering E2E tests
 *
 * Verifies:
 *   1. Admin user sees all 5 tabs (Timeline, Sessions, Stations, Users, Logs)
 *   2. Regular user sees only Timeline and Sessions tabs (not admin-only tabs)
 *   3. The stats section with 5 metric cards is always present
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsUser } from "../helpers/auth";
import { DashboardPage } from "../pages/dashboard.page";

test.describe("Dashboard rendering", () => {
  test("admin sees all five tabs", async ({ page }) => {
    await loginAsAdmin(page);
    const dashboard = new DashboardPage(page);

    await expect(dashboard.timelineTab).toBeVisible();
    await expect(dashboard.sessionsTab).toBeVisible();
    await expect(dashboard.stationsTab).toBeVisible();
    await expect(dashboard.usersTab).toBeVisible();
    await expect(dashboard.logsTab).toBeVisible();
  });

  test("regular user does not see admin-only tabs (Stations, Users, Logs)", async ({
    page,
  }) => {
    await loginAsUser(page);
    const dashboard = new DashboardPage(page);

    // User-facing tabs are visible
    await expect(dashboard.timelineTab).toBeVisible();
    await expect(dashboard.sessionsTab).toBeVisible();

    // Admin-only tabs must not be present in the DOM at all
    await expect(dashboard.stationsTab).not.toBeVisible();
    await expect(dashboard.usersTab).not.toBeVisible();
    await expect(dashboard.logsTab).not.toBeVisible();
  });

  test("stats section shows five metric cards", async ({ page }) => {
    await loginAsAdmin(page);
    const dashboard = new DashboardPage(page);

    await expect(dashboard.totalSessionsCard).toBeVisible();
    await expect(dashboard.completedSessionsCard).toBeVisible();
    await expect(dashboard.activeSessionsCard).toBeVisible();
    await expect(dashboard.plannedSessionsCard).toBeVisible();
    await expect(dashboard.uniqueStationsCard).toBeVisible();
  });
});
