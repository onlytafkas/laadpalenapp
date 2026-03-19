/**
 * Station management E2E tests (admin only)
 *
 * Verifies:
 *   1. Admin can create a new station and it appears in the Stations tab
 *   2. Admin can edit a station name and the updated name is displayed
 *   3. Admin can delete a station and it disappears from the list
 *
 * All test-created stations use the "E2E-" prefix so globalTeardown can
 * clean them up reliably.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";
import { DashboardPage } from "../pages/dashboard.page";
import { StationPage } from "../pages/station.page";

const NEW_STATION_NAME = "E2E-Station-Alpha";
const EDITED_STATION_NAME = "E2E-Station-Alpha-Edited";

test.describe("Station management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to the Stations tab
    const dashboard = new DashboardPage(page);
    await dashboard.gotoTab("stations");
    await page.waitForTimeout(500); // allow tab content to render
  });

  test("admin can create a station and it appears in the list", async ({
    page,
  }) => {
    const stationPage = new StationPage(page);

    await stationPage.clickAddStation();
    await stationPage.fillCreateStation(NEW_STATION_NAME, "Created by E2E test");
    await stationPage.submitCreate();

    // Dialog should close and the new station should appear in the tab
    await expect(
      page.getByRole("dialog", { name: "Add New Station" })
    ).not.toBeVisible();
    await expect(page.getByText(NEW_STATION_NAME)).toBeVisible();
  });

  test("admin can edit a station name", async ({ page }) => {
    const stationPage = new StationPage(page);

    // Precondition: the station from the previous test must exist.
    // If running in isolation, create it first.
    const stationVisible = await page
      .getByText(NEW_STATION_NAME)
      .isVisible()
      .catch(() => false);

    if (!stationVisible) {
      await stationPage.clickAddStation();
      await stationPage.fillCreateStation(NEW_STATION_NAME);
      await stationPage.submitCreate();
      await expect(page.getByText(NEW_STATION_NAME)).toBeVisible();
    }

    await stationPage.clickEdit(NEW_STATION_NAME);
    await stationPage.editStation(EDITED_STATION_NAME);

    // Dialog should close and the updated name should be visible
    await expect(
      page.getByRole("dialog", { name: "Edit Station" })
    ).not.toBeVisible();
    await expect(page.getByText(EDITED_STATION_NAME)).toBeVisible();
    // Use exact match so "E2E-Station-Alpha" doesn't match inside "E2E-Station-Alpha-Edited"
    await expect(page.getByText(NEW_STATION_NAME, { exact: true })).not.toBeVisible();
  });

  test("admin can delete a station and it disappears from the list", async ({
    page,
  }) => {
    const stationPage = new StationPage(page);

    // Ensure a deletable station exists
    const stationName = "E2E-Station-ToDelete";
    const alreadyVisible = await page
      .getByText(stationName)
      .isVisible()
      .catch(() => false);

    if (!alreadyVisible) {
      await stationPage.clickAddStation();
      await stationPage.fillCreateStation(stationName);
      await stationPage.submitCreate();
      await expect(page.getByText(stationName)).toBeVisible();
    }

    await stationPage.clickDelete(stationName);
    await stationPage.confirmDelete();

    // Dialog should close and station should be gone
    await expect(
      page.getByRole("dialog", { name: "Delete Station" })
    ).not.toBeVisible();
    await expect(page.getByText(stationName)).not.toBeVisible();
  });
});
