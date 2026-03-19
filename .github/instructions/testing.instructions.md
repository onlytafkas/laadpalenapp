---
description: Rules for writing and maintaining tests in the project. Always read this file before implementing or modifying any code — tests and coverage checks are mandatory for every change.
applyTo: "**"
---

# Testing Guidelines

## Core Requirement

**MANDATORY — read and apply these rules for every code change, no exceptions.**

- Every new piece of business logic MUST have **both unit tests and integration tests** written before or alongside the implementation.
- Every new user-facing feature, admin workflow, auth flow, or end-to-end business journey MUST have a **meaningful Playwright E2E test** written before or alongside the implementation.
- Tests must be **meaningful**: each test asserts real behaviour and covers a distinct scenario. Never write tests that exist only to inflate coverage numbers.
- Do not commit skipped tests (`it.skip`, `test.skip`, `describe.skip`) or focused tests (`it.only`, `test.only`, `describe.only`). If a test must be temporarily disabled while diagnosing infrastructure, document the root cause in the relevant instruction or issue, fix it immediately, and remove the skip before finishing the task.
- Tests are not optional and must pass before any change is considered complete.

After **every** code change (no exceptions):
1. Run the full unit test suite to confirm no regressions — `npm run test`
2. Run the integration test suite — `npm run test:integration`
3. Run coverage to confirm thresholds are maintained — `npm run test:coverage`
4. Run the E2E suite for any change that affects user-visible flows, routing, authentication, authorization, forms, dialogs, mutations, or dashboard workflows — `npm run test:e2e`
5. Ensure any temporary Neon branches created for E2E validation are deleted after the run, and prune stale `e2e/*` branches before retrying if Neon branch limits are reached.
6. If coverage drops below 80% on any business-logic file, add meaningful tests to restore it before finishing.

---

## Coverage Thresholds

The project targets **80% minimum on all four metrics** (Statements, Branches, Functions, Lines) for every business logic file:

| Layer | Target |
|---|---|
| `app/dashboard/actions.ts` | ≥ 80% Stmts / Branch / Funcs / Lines |
| `data/*.ts` | ≥ 80% (aim for 100%) |
| `components/*.tsx` (business components) | ≥ 80% |

**Exempt from coverage requirements** — do not write tests for these:
- `db/schema.ts` — Drizzle ORM relation definitions, no testable application logic
- `components/ui/*.tsx` — shadcn/ui passthrough wrappers (button, table, dialog, etc.)
- `app/layout.tsx`, `app/globals.css` — infrastructure, not business logic

---

## Test Tooling

- **Test runner**: Vitest v4
- **Component testing**: `@testing-library/react` + `@testing-library/user-event`
- **Coverage provider**: `@vitest/coverage-v8`

### Commands

```bash
npm run test              # Run all unit tests once (CI mode)
npm run test:watch        # Watch mode during development
npm run test:integration  # Run integration tests against pg-mem
npm run test:coverage     # Run all unit tests + generate coverage report
npm run test:e2e          # Run Playwright end-to-end tests against the real app
npm run test:ui           # Open the Vitest browser UI
```

---

## File & Directory Structure

Mirror the source tree under `__tests__/` for unit tests, under `__tests__/integration/` for integration tests, and use `e2e/` for Playwright browser flows:

```
__tests__/
  components/            ← unit tests for components/
  dashboard/             ← unit tests for app/dashboard/
  data/                  ← unit tests for data/
  helpers/               ← shared test helper utilities
  mocks/                 ← shared vi.mock factory modules
  integration/
    data/                ← integration tests for data/
    actions/             ← integration tests for app/dashboard/actions.ts
    flows/               ← cross-entity integration flows
    helpers/
      test-db.ts         ← shared pg-mem instance + backup/restore helpers
e2e/
  helpers/               ← auth, db, and safety helpers for Playwright
  pages/                 ← Playwright page objects wrapping the real UI
  tests/                 ← end-to-end specs for user-visible feature flows
```

**Naming**:
- Unit tests: source file name + `.test.ts` / `.test.tsx`  
  Example: `data/loading-sessions.ts` → `__tests__/data/loading-sessions.test.ts`
- Integration tests: source file name + `.integration.test.ts`  
  Example: `data/loading-sessions.ts` → `__tests__/integration/data/loading-sessions.integration.test.ts`
- E2E tests: feature or workflow name + `.spec.ts`  
  Example: station management flow → `e2e/tests/stations.spec.ts`

---

## Mocking Pattern (vi.hoisted + vi.mock)

All mocks **must** use `vi.hoisted()` so variables are available inside `vi.mock()` factory functions. This is required for ESM compatibility with Vitest.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// 1. Hoist mock variables FIRST — before any module imports
const { mockGetUserInfo, mockCreateStation } = vi.hoisted(() => ({
  mockGetUserInfo: vi.fn(),
  mockCreateStation: vi.fn(),
}));

// 2. Declare vi.mock() calls — hoisted by Vitest to before all imports
vi.mock("@/data/usersinfo", () => ({
  getUserInfo: mockGetUserInfo,
}));

vi.mock("@/data/stations", () => ({
  createStation: mockCreateStation,
}));

// 3. Import the module under test AFTER mock declarations
import { createStationAction } from "@/app/dashboard/actions";
```

### Standard mocks to always include for server action tests

```typescript
// Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockAuthUserId.value })),
}));

// next/headers (required by actions.ts)
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => null) })),
}));

// next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
```

### Database mock chain pattern (for data layer tests)

```typescript
const mockDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
};

vi.mock("@/db", () => ({ db: mockDb }));
```

---

## What to Test for Each Layer

### Data functions (`data/*.ts`)

Every exported function needs **both** a unit test and an integration test.

**Unit test** (mocked DB — `__tests__/data/`):
- **Happy path**: correct input → expected return value
- **Not found**: query returns empty array → function returns `null` or `[]`
- **Edge cases**: `null`/`undefined` optional fields, empty string treated as `null`

**Integration test** (real pg-mem DB — `__tests__/integration/data/`):
- **Real SQL correctness**: the generated SQL runs without error
- **Constraints**: UNIQUE, FK, and NOT NULL constraints behave as expected
- **Ordering / filtering**: ORDER BY, WHERE clauses return the right rows
- **Relationships**: any join or relation loading works end-to-end

```typescript
// Integration test pattern for data functions
vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));
import { mem, emptyBackup } from "@/__tests__/integration/helpers/test-db";

let backup: ReturnType<typeof mem.backup>;
beforeAll(() => { emptyBackup.restore(); backup = mem.backup(); });
afterAll(() => { emptyBackup.restore(); });
beforeEach(() => { backup.restore(); });
```

```typescript
describe("getStationById", () => {
  it("returns the station when found", async () => {
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([station]) }) });
    expect(await getStationById("1")).toEqual(station);
  });

  it("returns null when not found", async () => {
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
    expect(await getStationById("999")).toBeNull();
  });
});
```

### Server actions (`app/dashboard/actions.ts`)

Every server action needs **both** a unit test and an integration test.

**Unit test** (mocked DB + mocked data layer — `__tests__/dashboard/`):
1. **Unauthenticated** — `userId` is null → returns `{ error: "Unauthorized" }`
2. **Non-admin / insufficient permission** — returns appropriate error
3. **Validation error** — invalid input → returns `{ error: "..." }`
4. **Resource not found** — returns `{ error: "... not found" }`
5. **Success** — valid input + correct role → returns `{ success: true, data: ... }`
6. **DB error path** — data layer throws → returns `{ error: "Failed to ..." }`

**Integration test** (real pg-mem DB, only Clerk/next mocked — `__tests__/integration/actions/`):
1. **Auth guard** — unauthenticated returns correct error
2. **Permission guard** — non-admin forbidden
3. **Success + DB persist** — row actually exists in the DB after the action
4. **Audit log written** — correct audit entry in `audit_logs` table
5. **Constraint / business rule** — duplicate names, cooldown, overlap, etc.

```typescript
// Integration action test: only mock auth and Next.js infra
vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: mockUserId.value })) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: vi.fn(() => null) })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

### React components (`components/*.tsx`)

Every business component must test:
1. **Renders correctly** — key UI elements are present
2. **User interactions** — button clicks, form submissions, dialog open/close
3. **Cancel / dismiss** — every Cancel button's `onClick` closes the dialog
4. **Conditional rendering** — props that toggle visibility or content
5. **Accessibility** — labels and ARIA attributes are present

```typescript
it("closes the dialog when Cancel is clicked", async () => {
  const user = userEvent.setup();
  render(<MyDialog {...props} />);
  await user.click(screen.getByRole("button", { name: /open/i }));
  await user.click(screen.getByRole("button", { name: /cancel/i }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

### End-to-end features (`e2e/tests/*.spec.ts`)

Every new user-visible feature or workflow must have at least one meaningful Playwright E2E test.

Write E2E coverage when the change affects any of these:
1. **Navigation / routing** — redirects, protected routes, tab changes, deep-link behaviour
2. **Authentication / authorization** — sign-in, sign-out, role-based visibility, forbidden actions
3. **Forms and dialogs** — opening, validation, submit success, cancel / dismiss
4. **Cross-layer workflows** — UI + server action + database persistence + refreshed UI state
5. **Regression-prone journeys** — multi-step flows that previously broke or depend on timing/state

Each E2E test should verify real user outcomes such as:
1. The user can reach the flow from the real application shell
2. The intended action succeeds or the correct guard/error is shown
3. The visible UI updates after the mutation or navigation completes
4. Critical side effects are observable where appropriate (for example audit log entries, refreshed lists, new records shown)

E2E tests must use the existing Playwright structure in `e2e/helpers/`, `e2e/pages/`, and `e2e/tests/`. Prefer updating page objects over duplicating raw selectors across specs.

---

## beforeEach Reset Pattern

Always reset mocks between tests to prevent state leakage:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUserId.value = "user_test123"; // reset to a valid logged-in user
  // reset any other stateful mock defaults here
});
```

---

## Test Quality Rules

1. **Meaningful tests only** — every test must assert real, observable behaviour. A test that only checks "it didn't throw" or duplicates an already-covered path has no value and must not be added.
2. **Cover all branches** — aim for 100% branch coverage on data functions and server actions. For each `if`/`else`, `try`/`catch`, and ternary in business logic, there should be at least one test exercising each path.
3. **No snapshots** — use explicit `expect(x).toEqual(y)` assertions
4. **Test behaviour, not implementation** — do not test internal function calls unless they represent side effects (e.g., audit log was written, revalidatePath was called)
5. **One concept per test** — keep each `it()` focused on a single scenario
6. **Descriptive names** — write test names as sentences: `"returns error when station is not found"`
7. **No dead coverage** — do not spy or call a function just to move a line into the covered set without asserting its return value or side effect

## External Service Testing

- Tests must never trigger real external side effects such as SMS, email, or third-party mutations.
- For server actions, route handlers, and other callers of `lib/session-sms.ts`, mock `sendSessionEventSms` and assert that it was invoked with the expected payload.
- Keep Twilio transport coverage isolated to `__tests__/lib/session-sms.test.ts`, where `fetch` is stubbed and the request URL, headers, and body are asserted directly.
- When E2E needs the real application path to execute SMS logic, point Twilio traffic at a local mock server via environment configuration instead of disabling the code path or calling the real Twilio API.
- When testing expected failure paths that log errors, stub `console.error` in the test so intentional failures do not pollute the test output.

---

## Integration Test Infrastructure

The project uses **pg-mem** (in-memory PostgreSQL) for integration tests. Key facts:

- Config: `vitest.integration.config.ts` (separate from the unit test config)
- Shared DB helper: `__tests__/integration/helpers/test-db.ts`
  - Exports `db` (Drizzle instance), `mem` (pg-mem instance), `emptyBackup` (clean-schema snapshot)
  - Mock `@/db` with `vi.mock("@/db", async () => await import("@/__tests__/integration/helpers/test-db"))` at the top of every integration test file
- **Isolation pattern** — every integration test file must use:
  ```typescript
  let backup: ReturnType<typeof mem.backup>;
  beforeAll(() => { emptyBackup.restore(); /* seed */; backup = mem.backup(); });
  afterAll(() => { emptyBackup.restore(); });
  beforeEach(() => { backup.restore(); });
  ```
- **Known pg-mem limitation**: `LEFT JOIN LATERAL` (used by drizzle's `with:` relation loading) is not supported. Skip those tests with `it.skip` and a comment, and rely on unit tests for relation-loading coverage.
- **Timezone**: pg-mem returns timestamps as UTC strings. Use `getUTCHours()` / `getUTCMinutes()` in assertions, never `getHours()` / `getMinutes()`.

## Playwright E2E Environment Hygiene

- Any helper or script that creates temporary Neon branches for E2E runs MUST clean them up before finishing.
- If Neon returns a root-branch or branch-count limit error, prune stale `e2e/*` branches before retrying the run.
- E2E infrastructure changes are not complete until branch lifecycle cleanup is handled explicitly and repeatably.

---

## Checklist — Required Before Finishing Any Change

Run through this checklist for **every** code change — not only new features:

- [ ] Identified every new or modified code path (branches, conditionals, error paths)
- [ ] Wrote a **meaningful unit test** for each identified path — happy path, error path, edge cases
- [ ] Wrote a **meaningful integration test** for each new data function and server action
- [ ] Wrote unit tests for every new business component in `components/`
- [ ] Wrote or updated a **meaningful E2E test** for every new or changed user-visible feature flow
- [ ] Ran `npm run test` — all unit tests pass (0 failures)
- [ ] Ran `npm run test:integration` — all integration tests pass (0 failures)
- [ ] Ran `npm run test:coverage` — all business logic files remain at ≥ 80% Stmts / Branch / Funcs / Lines
- [ ] Ran `npm run test:e2e` for any change that affects real browser workflows, and the affected E2E coverage passes
- [ ] Confirmed temporary Neon E2E branches were deleted and stale `e2e/*` leftovers were pruned if needed
- [ ] Coverage did not drop compared to before the change; if it did, added tests to restore or exceed the previous level
- [ ] No existing tests were broken by the change
