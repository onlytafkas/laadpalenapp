import { type Page, type Locator } from "@playwright/test";

export class UserPage {
  readonly page: Page;
  readonly addUserButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addUserButton = page.getByRole("button", { name: "Add User" });
  }

  /** Open the "Add New User" dialog */
  async clickAddUser() {
    await this.addUserButton.click();
    await this.page.getByRole("dialog", { name: "Add New User" }).waitFor();
  }

  /** Fill the create-user form */
  async fillCreateUser(userId: string, carNumberPlate: string) {
    const dialog = this.page.getByRole("dialog", { name: "Add New User" });
    await dialog.getByLabel("User ID").fill(userId);
    await dialog.getByLabel("Car Number Plate").fill(carNumberPlate);
  }

  /** Submit the create-user dialog */
  async submitCreate() {
    await this.page
      .getByRole("dialog", { name: "Add New User" })
      .getByRole("button", { name: "Create User" })
      .click();
  }

  /**
   * Click the Deactivate button for the user identified by userId.
   * The button has aria-label="Deactivate" when the user is active.
   */
  async clickDeactivate(userId: string) {
    // Narrow to the specific user card: the innermost div that contains the
    // userId text AND the Deactivate button (avoids matching parent containers
    // that hold multiple Deactivate buttons → strict-mode violation).
    await this.page
      .locator("div")
      .filter({ hasText: userId })
      .filter({ has: this.page.getByRole("button", { name: "Deactivate" }) })
      .last()
      .getByRole("button", { name: "Deactivate" })
      .click();
    await this.page
      .getByRole("dialog", { name: "Deactivate User" })
      .waitFor();
  }

  /**
   * Click the Activate button for the user identified by userId.
   * The button has aria-label="Activate" when the user is inactive.
   */
  async clickActivate(userId: string) {
    // Same narrowing strategy as clickDeactivate.
    await this.page
      .locator("div")
      .filter({ hasText: userId })
      .filter({ has: this.page.getByRole("button", { name: "Activate" }) })
      .last()
      .getByRole("button", { name: "Activate" })
      .click();
    await this.page
      .getByRole("dialog", { name: "Activate User" })
      .waitFor();
  }

  /** Confirm a Deactivate dialog */
  async confirmDeactivate() {
    await this.page
      .getByRole("dialog", { name: "Deactivate User" })
      .getByRole("button", { name: "Deactivate" })
      .click();
  }

  /** Confirm an Activate dialog */
  async confirmActivate() {
    await this.page
      .getByRole("dialog", { name: "Activate User" })
      .getByRole("button", { name: "Activate" })
      .click();
  }
}
