/**
 * E2E test runner with Neon branch lifecycle management.
 *
 * Requires NEON_API_KEY:
 *   1. Creates a fresh Neon branch named  e2e/run-<timestamp>
 *   2. Migrates the schema onto it
 *   3. Runs `playwright test` with E2E_DATABASE_URL pointing at the new branch
 *   4. Deletes the branch (even on failure)
 *
 * Safety guarantee: the runner refuses to start if E2E_DATABASE_URL contains
 * the dev endpoint ID (DEV_NEON_ENDPOINT).  This prevents any Playwright run
 * from ever targeting the production / development database.
 *
 * Usage:
 *   npm run test:e2e              # standard run
 *   npm run test:e2e:headed       # headed browser
 *   npm run test:e2e -- --grep "station" # forward args to playwright
 */
import path from "path";
import { config } from "dotenv";
import { spawnSync } from "child_process";
import { withLibpqSslCompatibility } from "../lib/postgres-connection-string";
import { assertGeneratedE2EBranchName } from "../e2e/helpers/safety";

// Load .env.e2e.local before touching any process.env keys
config({ path: path.resolve(__dirname, "../.env.e2e.local") });

// ── Constants ────────────────────────────────────────────────────────────────

const NEON_API_KEY = (process.env.NEON_API_KEY ?? "").trim();
const NEON_PROJECT_ID =
  (process.env.NEON_PROJECT_ID ?? "").trim() || "raspy-grass-54578804";
/** The dev endpoint prefix — any E2E URL containing this string is rejected. */
const DEV_NEON_ENDPOINT =
  (process.env.DEV_NEON_ENDPOINT ?? "").trim() || "ep-floral-boat-a9vh2brv";
const BRANCH_PREFIX = "e2e/run-";
const NEON_API = "https://console.neon.tech/api/v2";
const E2E_PARENT_BRANCH = (process.env.E2E_PARENT_BRANCH ?? "").trim();

// ── Neon API helpers ─────────────────────────────────────────────────────────

async function neonRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${NEON_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NEON_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon API ${method} ${path} → ${res.status}: ${text}`);
  }

  return method === "DELETE" ? undefined : res.json();
}

type NeonBranch = {
  id: string;
  name: string;
  default: boolean;
};

async function listBranches(search?: string): Promise<NeonBranch[]> {
  const query = search
    ? `?search=${encodeURIComponent(search)}`
    : "";
  const data = (await neonRequest(
    "GET",
    `/projects/${NEON_PROJECT_ID}/branches${query}`
  )) as { branches: NeonBranch[] };

  return data.branches;
}

async function resolveParentBranch(): Promise<NeonBranch> {
  if (E2E_PARENT_BRANCH) {
    const branches = await listBranches(E2E_PARENT_BRANCH);
    const matchedBranch = branches.find(
      (branch) =>
        branch.id === E2E_PARENT_BRANCH || branch.name === E2E_PARENT_BRANCH
    );

    if (!matchedBranch) {
      throw new Error(
        `E2E_PARENT_BRANCH=\"${E2E_PARENT_BRANCH}\" did not match any Neon branch in project ${NEON_PROJECT_ID}.`
      );
    }

    return matchedBranch;
  }

  const branches = await listBranches();
  const defaultBranch = branches.find((branch) => branch.default);

  if (!defaultBranch) {
    throw new Error(
      `Could not resolve the default Neon branch for project ${NEON_PROJECT_ID}.`
    );
  }

  return defaultBranch;
}

async function createBranch(
  name: string,
  parentBranchId: string
): Promise<{ branchId: string; connectionUrl: string }> {
  assertGeneratedE2EBranchName(name);

  const data = (await neonRequest(
    "POST",
    `/projects/${NEON_PROJECT_ID}/branches`,
    {
      branch: { name, parent_id: parentBranchId, init_source: "schema-only" },
      endpoints: [{ type: "read_write" }],
    }
  )) as { branch: { id: string } };

  const branchId = data.branch.id;

  const conn = (await neonRequest(
    "GET",
    `/projects/${NEON_PROJECT_ID}/connection_uri?branch_id=${branchId}&database_name=neondb&role_name=neondb_owner`
  )) as { uri: string };

  return {
    branchId,
    connectionUrl: withLibpqSslCompatibility(conn.uri),
  };
}

async function deleteBranch(branchId: string): Promise<void> {
  console.log(`\n🗑  Deleting Neon branch ${branchId}...`);
  await neonRequest(
    "DELETE",
    `/projects/${NEON_PROJECT_ID}/branches/${branchId}`
  );
  console.log(`   Branch deleted.`);
}

// ── Safety check ─────────────────────────────────────────────────────────────

function assertNotDevDatabase(url: string): void {
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is empty. " +
        "The e2e runner must create a temporary Neon branch first. " +
        "Set NEON_API_KEY in .env.e2e.local and run npm run test:e2e."
    );
  }
  if (url.includes(DEV_NEON_ENDPOINT)) {
    throw new Error(
      `🚨 SAFETY GUARD: E2E_DATABASE_URL contains the dev endpoint ` +
        `"${DEV_NEON_ENDPOINT}". Refusing to run tests against the dev database.`
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let createdBranchId: string | null = null;
  let dbUrl: string;
  let createdBranchName: string | null = null;

  try {
    // ── Step 1: resolve the test database URL ────────────────────────────────
    if (!NEON_API_KEY) {
      throw new Error(
        "NEON_API_KEY is required for e2e runs. " +
          "This project no longer supports a permanent fallback test branch."
      );
    }

    const ts = new Date()
      .toISOString()
      .replace(/T/, "-")
      .replace(/[:.]/g, "")
      .slice(0, 15);
    const branchName = `${BRANCH_PREFIX}${ts}`;
    const parentBranch = await resolveParentBranch();
    createdBranchName = branchName;
    console.log(`\n🌿 Creating Neon branch: ${branchName}`);
    console.log(
      `   Source branch: ${parentBranch.name} (${parentBranch.id}) [schema-only]`
    );
    const { branchId, connectionUrl } = await createBranch(
      branchName,
      parentBranch.id
    );
    createdBranchId = branchId;
    dbUrl = connectionUrl;
    console.log(`   Branch ID: ${branchId}`);

    // ── Step 2: safety guard ─────────────────────────────────────────────────
    assertNotDevDatabase(dbUrl);

    // ── Step 3: expose URL to playwright (inherits via child process env) ────
    process.env.E2E_DATABASE_URL = dbUrl;
    process.env.E2E_DB_BRANCH_ID = createdBranchId;
    process.env.E2E_DB_BRANCH_NAME = createdBranchName;

    // ── Step 4: migrate schema if we created a fresh branch ─────────────────
    console.log("📦 Migrating schema onto test branch...");
    const migrate = spawnSync(
      "npx",
      ["drizzle-kit", "push", "--config", "drizzle.e2e.config.ts"],
      { stdio: "inherit", shell: true, env: process.env }
    );
    if (migrate.status !== 0) {
      throw new Error("Schema migration failed — aborting test run.");
    }

    // ── Step 5: run playwright, forwarding any extra CLI args ────────────────
    const extraArgs = process.argv.slice(2);
    console.log("\n🎭 Starting Playwright...\n");
    const pw = spawnSync("npx", ["playwright", "test", ...extraArgs], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    // Exit with playwright's exit code (propagated after branch cleanup)
    process.exitCode = pw.status ?? 1;
  } finally {
    // ── Step 6: always clean up the ephemeral branch ─────────────────────────
    if (createdBranchId) {
      try {
        await deleteBranch(createdBranchId);
      } catch (err) {
        console.error("⚠️  Failed to delete branch:", err);
        console.error(
          `   Please delete branch ${createdBranchId} manually in the Neon console.`
        );
      }
    }
  }
}

main().catch((err) => {
  console.error("\n❌ e2e-run failed:", err.message ?? err);
  process.exit(1);
});
