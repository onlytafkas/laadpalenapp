import { type Page, type Locator } from "@playwright/test";

export class HomePage {
  readonly page: Page;

  readonly getStartedButton: Locator;
  readonly startManagingButton: Locator;
  readonly learnMoreButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.getStartedButton = page.getByRole("button", { name: "Get Started" });
    this.startManagingButton = page.getByRole("button", {
      name: "Start Managing Today",
    });
    this.learnMoreButton = page.getByRole("link", { name: "Learn More" });
  }

  async goto() {
    await this.page.goto("/");
  }
}
