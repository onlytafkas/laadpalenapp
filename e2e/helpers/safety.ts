const DEFAULT_DEV_NEON_ENDPOINT = "ep-floral-boat-a9vh2brv";

function assertE2EBranchName(branchName: string): void {
  if (!branchName.toLowerCase().startsWith("e2e")) {
    throw new Error(
      `SAFETY VIOLATION: E2E_DB_BRANCH_NAME="${branchName}" does not start with 'e2e'.\n` +
        "Playwright e2e runs are only allowed on Neon branches whose names start with 'e2e'."
    );
  }
}

export function getRequiredE2EBranchName(): string {
  const branchName = process.env.E2E_DB_BRANCH_NAME;

  if (!branchName) {
    throw new Error(
      "E2E_DB_BRANCH_NAME is not set.\n" +
        "Run Playwright through npm run test:e2e so the wrapper can create a temporary e2e/* branch and inject its name."
    );
  }

  assertE2EBranchName(branchName);
  return branchName;
}

export function assertSafeE2EDatabaseUrl(url: string): void {
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is empty.\n" +
        "Run Playwright through npm run test:e2e so the wrapper can create a temporary e2e/* branch first."
    );
  }

  const devUrl = process.env.DATABASE_URL;
  if (devUrl && url === devUrl) {
    throw new Error(
      "SAFETY VIOLATION: E2E_DATABASE_URL is the same as DATABASE_URL.\n" +
        "E2E tests must NEVER run against the development database."
    );
  }

  const devEndpoint =
    (process.env.DEV_NEON_ENDPOINT ?? "").trim() || DEFAULT_DEV_NEON_ENDPOINT;
  if (url.includes(devEndpoint)) {
    throw new Error(
      `SAFETY VIOLATION: E2E_DATABASE_URL contains the dev endpoint "${devEndpoint}".\n` +
        "E2E tests must NEVER run against the development database."
    );
  }
}

export function assertSafePlaywrightE2EEnvironment(): {
  branchName: string;
  databaseUrl: string;
} {
  const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
  const branchName = getRequiredE2EBranchName();

  assertSafeE2EDatabaseUrl(databaseUrl);

  return { branchName, databaseUrl };
}

export function assertGeneratedE2EBranchName(branchName: string): void {
  assertE2EBranchName(branchName);
}