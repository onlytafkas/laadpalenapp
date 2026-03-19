/**
 * Audit log E2E tests (admin only)
 *
 * Verifies that actions performed through the UI produce visible entries in the
 * Logs tab:
 *   1. Creating a station → a "create_station" entry appears in the Logs tab
 *   2. A session reservation → a "create_session" entry appears in the Logs tab
 *
 * The Logs tab renders a table with each row showing the action name and status.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";
import { DashboardPage } from "../pages/dashboard.page";
import { StationPage } from "../pages/station.page";
import { SessionPage } from "../pages/session.page";

const AUDIT_STATION_NAME = "E2E-Audit-Station";
const STATION_NAME = "E2E Test Station"; // seeded in global-setup

test.describe("Audit log entries", () => {
  test("creating a station produces a create_station success entry in the Logs tab", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const dashboard = new DashboardPage(page);
    const stationPage = new StationPage(page);

    // Perform the action
    await dashboard.gotoTab("stations");
    await stationPage.clickAddStation();
    await stationPage.fillCreateStation(
      AUDIT_STATION_NAME,
      "E2E audit test station"
    );
    await stationPage.submitCreate();
    await expect(page.getByText(AUDIT_STATION_NAME)).toBeVisible();

    // Navigate to Logs tab and verify the entry
    await dashboard.gotoTab("audit");

    // The audit log table should show an action related to station creation
    await expect(
      page.getByText(/create_station/i).first()
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByText(/success/i).first()
    ).toBeVisible();
  });

  test("reserving a session produces a create_session success entry in the Logs tab", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const dashboard = new DashboardPage(page);
    const sessionPage = new SessionPage(page);

    // Admin is also a registered user (seeded in global-setup with isActive=true)
    // so they can reserve sessions
    await sessionPage.openReserveDialog();
    await sessionPage.selectStation(STATION_NAME);
    await sessionPage.selectDuration("30 minutes");
    await sessionPage.submitReservation();

    // If overlap adjustment is offered, confirm it
    const confirmBtn = page.getByRole("button", { name: "Confirm New Time" });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(
      page.getByRole("dialog", { name: "Reserve Charging Session" })
    ).not.toBeVisible();

    // Navigate to Logs tab
    await dashboard.gotoTab("audit");

    await expect(
      page.getByText(/create_session/i).first()
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByText(/success/i).first()
    ).toBeVisible();
  });
});
