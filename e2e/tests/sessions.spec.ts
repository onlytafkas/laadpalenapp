/**
 * Session booking E2E tests (regular user)
 *
 * Verifies:
 *   1. A user can book a future session against the seeded "E2E Test Station"
 *      and it appears in the Future Sessions list
 *   2. Booking a slot that overlaps an existing session shows the
 *      "Confirm New Time" adjustment flow
 *   3. Booking within the 4-hour cooldown window shows an error message
 *
 * Uses the seeded "E2E Test Station" that was created in global-setup.ts.
 */
import { test, expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { loginAsUser } from "../helpers/auth";
import { testDb, testPool } from "../helpers/db";
import { sessions, stations } from "../../db/schema";
import { DashboardPage } from "../pages/dashboard.page";
import { SessionPage } from "../pages/session.page";

const STATION_NAME = "E2E Test Station";

const E2E_ADMIN_USER_ID = process.env.E2E_ADMIN_USER_ID ?? "user_e2e_admin";
const E2E_REGULAR_USER_ID =
  process.env.E2E_REGULAR_USER_ID ?? "user_e2e_regular";

test.describe("Session booking", () => {
  // Clean up sessions for both E2E users before each test so tests are fully
  // independent (no 4-hour cooldown carry-over between booking tests).
  test.beforeEach(async () => {
    await testDb
      .delete(sessions)
      .where(
        inArray(sessions.userId, [E2E_ADMIN_USER_ID, E2E_REGULAR_USER_ID])
      );
  });

  test.afterAll(async () => {
    await testPool.end();
  });
  test("user can book a future session and it appears in Future Sessions", async ({
    page,
  }) => {
    await loginAsUser(page);
    const dashboard = new DashboardPage(page);
    const sessionPage = new SessionPage(page);

    // Open reserve dialog
    await sessionPage.openReserveDialog();

    // Select station and duration (default start is ~5 minutes from now)
    await sessionPage.selectStation(STATION_NAME);
    await sessionPage.selectDuration("1 hour");

    // Submit
    await sessionPage.submitReservation();

    // The station may already be booked (e.g., by the audit-log test running
    // before this one). Use waitFor so we properly poll for the button to
    // appear (isVisible does not retry — waitFor does).
    const confirmBtn = page.getByRole("button", { name: "Confirm New Time" });
    const overlapOffered = await confirmBtn
      .waitFor({ state: "visible", timeout: 7000 })
      .then(() => true)
      .catch(() => false);
    if (overlapOffered) {
      await confirmBtn.click();
    }

    // Dialog should close, then navigate to Sessions tab to verify
    await expect(
      page.getByRole("dialog", { name: "Reserve Charging Session" })
    ).not.toBeVisible();

    await dashboard.gotoTab("sessions");

    // The Future Sessions section should contain the station name
    await expect(page.getByText("Future Sessions")).toBeVisible();
    await expect(page.getByText(STATION_NAME).first()).toBeVisible();
  });

  test("booking an overlapping slot shows the suggestion confirmation dialog", async ({
    page,
  }) => {
    const [station] = await testDb
      .select()
      .from(stations)
      .where(eq(stations.name, STATION_NAME));

    if (!station) {
      throw new Error(`Seed station not found: ${STATION_NAME}`);
    }

    const seededStart = new Date();
    seededStart.setMinutes(seededStart.getMinutes() + 10, 0, 0);
    const seededEnd = new Date(seededStart);
    seededEnd.setHours(seededEnd.getHours() + 2);

    // Seed an overlapping session for a different user so the regular user hits
    // the overlap-confirmation path rather than their own 4-hour cooldown path.
    await testDb.insert(sessions).values({
      userId: E2E_ADMIN_USER_ID,
      stationId: station.id,
      startTime: seededStart,
      endTime: seededEnd,
    });

    await loginAsUser(page);
    const sessionPage = new SessionPage(page);

    // Attempt to book the same station. The seeded admin session overlaps with
    // the default requested range, so the app should offer an adjusted time.
    await sessionPage.openReserveDialog();
    await sessionPage.selectStation(STATION_NAME);
    await sessionPage.selectDuration("2 hours");
    await sessionPage.submitReservation();

    // The app should show the overlap adjustment UI ("Confirm New Time")
    await expect(
      page.getByRole("button", { name: "Confirm New Time" })
    ).toBeVisible({ timeout: 7000 });
  });

  test("booking within the 4-hour cooldown window shows an error", async ({
    page,
  }) => {
    await loginAsUser(page);
    const sessionPage = new SessionPage(page);

    // First booking — should succeed
    await sessionPage.openReserveDialog();
    await sessionPage.selectStation(STATION_NAME);
    await sessionPage.selectDuration("30 minutes");
    await sessionPage.submitReservation();

    // If it needed a confirmation (overlap), confirm it so we have a real session.
    // Use waitFor instead of isVisible — waitFor polls properly.
    const confirmBtn = page.getByRole("button", { name: "Confirm New Time" });
    const overlapOffered = await confirmBtn
      .waitFor({ state: "visible", timeout: 7000 })
      .then(() => true)
      .catch(() => false);
    if (overlapOffered) {
      await confirmBtn.click();
    }

    await expect(
      page.getByRole("dialog", { name: "Reserve Charging Session" })
    ).not.toBeVisible();

    // Immediately try to book again — should hit the 4-hour cooldown
    await sessionPage.openReserveDialog();
    await sessionPage.selectStation(STATION_NAME);
    await sessionPage.selectDuration("30 minutes");
    await sessionPage.submitReservation();

    // Expect an error message mentioning cooldown or a time restriction
    await expect(
      page
        .getByRole("dialog", { name: "Reserve Charging Session" })
        .getByText(/cooldown|4.hour|wait|next session/i)
    ).toBeVisible({ timeout: 7000 });
  });

  test("completed sessions only show entries finished today", async ({ page }) => {
    const uniqueSuffix = Date.now();
    const yesterdayStationName = `E2E Yesterday Station ${uniqueSuffix}`;
    const todayStationName = `E2E Today Station ${uniqueSuffix}`;

    const [yesterdayStation] = await testDb
      .insert(stations)
      .values({ name: yesterdayStationName })
      .returning();
    const [todayStation] = await testDb
      .insert(stations)
      .values({ name: todayStationName })
      .returning();

    const now = new Date();

    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(9, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(10, 0, 0, 0);

    const todayStart = new Date(now);
    todayStart.setHours(11, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(12, 0, 0, 0);

    await testDb.insert(sessions).values([
      {
        userId: E2E_REGULAR_USER_ID,
        stationId: yesterdayStation.id,
        startTime: yesterdayStart,
        endTime: yesterdayEnd,
      },
      {
        userId: E2E_REGULAR_USER_ID,
        stationId: todayStation.id,
        startTime: todayStart,
        endTime: todayEnd,
      },
    ]);

    await loginAsUser(page);
    const dashboard = new DashboardPage(page);

    await dashboard.gotoTab("sessions");

    const completedSessionsCard = page
      .getByRole("heading", { name: "Completed Sessions" })
      .locator("..");

    await expect(completedSessionsCard.getByText(todayStationName)).toBeVisible();
    await expect(completedSessionsCard.getByText(yesterdayStationName)).toHaveCount(0);
  });

  test("active sessions do not expose an edit action in the Sessions tab", async ({
    page,
  }) => {
    const [station] = await testDb
      .select()
      .from(stations)
      .where(eq(stations.name, STATION_NAME));

    if (!station) {
      throw new Error(`Seed station not found: ${STATION_NAME}`);
    }

    const activeStart = new Date();
    activeStart.setMinutes(activeStart.getMinutes() - 15, 0, 0);
    const activeEnd = new Date();
    activeEnd.setMinutes(activeEnd.getMinutes() + 45, 0, 0);

    await testDb.insert(sessions).values({
      userId: E2E_REGULAR_USER_ID,
      stationId: station.id,
      startTime: activeStart,
      endTime: activeEnd,
    });

    await loginAsUser(page);
    const dashboard = new DashboardPage(page);

    await dashboard.gotoTab("sessions");

    const activeSessionsCard = page
      .getByRole("heading", { name: "Active Sessions" })
      .locator("..");

    await expect(activeSessionsCard.getByText(STATION_NAME)).toBeVisible();
    await expect(activeSessionsCard.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });
});
