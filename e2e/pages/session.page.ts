import { type Page, type Locator } from "@playwright/test";

export class SessionPage {
  readonly page: Page;
  readonly reserveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.reserveButton = page.getByRole("button", { name: "Reserve Session" });
  }

  /** Open the "Reserve Charging Session" dialog */
  async openReserveDialog() {
    await this.reserveButton.click();
    await this.page
      .getByRole("dialog", { name: "Reserve Charging Session" })
      .waitFor();
  }

  /** Select a station from the dropdown by its visible name */
  async selectStation(stationName: string) {
    // Open the station select trigger
    await this.page.getByRole("combobox").first().click();
    // Click the matching option
    await this.page.getByRole("option", { name: stationName }).click();
  }

  /**
   * Choose a duration from the duration dropdown.
   * @param label One of: "30 minutes" | "1 hour" | "2 hours" | "3 hours"
   */
  async selectDuration(label: "30 minutes" | "1 hour" | "2 hours" | "3 hours") {
    // The duration select is the second combobox in the dialog
    await this.page.getByRole("combobox").nth(1).click();
    await this.page.getByRole("option", { name: label }).click();
  }

  /**
   * Submit the reservation form.
   * If there is a validation error, this will not close the dialog.
   */
  async submitReservation() {
    await this.page
      .getByRole("dialog", { name: "Reserve Charging Session" })
      .getByRole("button", { name: "Reserve Session" })
      .click();
  }

  /**
   * Confirm an overlap-adjustment suggestion by clicking "Confirm New Time".
   */
  async confirmOverlapAdjustment() {
    await this.page.getByRole("button", { name: "Confirm New Time" }).click();
  }

  /** Cancel and close the dialog */
  async cancel() {
    await this.page
      .getByRole("dialog", { name: "Reserve Charging Session" })
      .getByRole("button", { name: "Cancel" })
      .click();
  }
}
