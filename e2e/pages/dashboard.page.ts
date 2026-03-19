import { type Page, type Locator } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;

  // Tab triggers
  readonly timelineTab: Locator;
  readonly sessionsTab: Locator;
  readonly stationsTab: Locator;
  readonly usersTab: Locator;
  readonly logsTab: Locator;

  // Stat cards (by heading text)
  readonly totalSessionsCard: Locator;
  readonly completedSessionsCard: Locator;
  readonly activeSessionsCard: Locator;
  readonly plannedSessionsCard: Locator;
  readonly uniqueStationsCard: Locator;

  // Primary CTA
  readonly reserveSessionButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.timelineTab = page.getByRole("tab", { name: "Timeline" });
    this.sessionsTab = page.getByRole("tab", { name: "Sessions" });
    this.stationsTab = page.getByRole("tab", { name: "Stations" });
    this.usersTab = page.getByRole("tab", { name: "Users" });
    this.logsTab = page.getByRole("tab", { name: "Logs" });

    this.totalSessionsCard = page.getByText("Total Sessions");
    this.completedSessionsCard = page.getByText("Completed Sessions");
    this.activeSessionsCard = page.getByText("Active Sessions");
    this.plannedSessionsCard = page.getByText("Planned Sessions");
    this.uniqueStationsCard = page.getByText("Unique Stations");

    this.reserveSessionButton = page.getByRole("button", {
      name: "Reserve Session",
    });
  }

  async goto() {
    await this.page.goto("/dashboard");
    await this.page.waitForURL("**/dashboard");
  }

  async gotoTab(name: "timeline" | "sessions" | "stations" | "users" | "audit") {
    const triggerMap: Record<string, Locator> = {
      timeline: this.timelineTab,
      sessions: this.sessionsTab,
      stations: this.stationsTab,
      users: this.usersTab,
      audit: this.logsTab,
    };
    await triggerMap[name].click();
  }
}
