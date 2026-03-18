---
description: Rules for writing and maintaining tests in the project. Use whenever adding a new feature, data function, server action, or component — and always after any code change.
---

# Testing Guidelines

## Core Requirement

**Every new piece of business logic MUST have tests written before or alongside the implementation.** Tests are not optional and must pass before any change is considered complete.

After any code change, always:
1. Run the full test suite to confirm no regressions — `npm run test`
2. Run coverage to confirm thresholds are maintained — `npm run test:coverage`

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
npm run test              # Run all tests once (CI mode)
npm run test:watch        # Watch mode during development
npm run test:coverage     # Run all tests + generate coverage report
npm run test:ui           # Open the Vitest browser UI
```

---

## File & Directory Structure

Mirror the source tree under `__tests__/`:

```
__tests__/
  components/            ← tests for components/
  dashboard/             ← tests for app/dashboard/
  data/                  ← tests for data/
  helpers/               ← shared test helper utilities
  mocks/                 ← shared vi.mock factory modules
```

**Naming**: test file name = source file name + `.test.ts` / `.test.tsx`.  
Example: `data/loading-sessions.ts` → `__tests__/data/loading-sessions.test.ts`

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

Test every exported function. For each function write tests covering:
- **Happy path**: correct input → expected return value
- **Not found**: query returns empty array → function returns `null` or `[]`
- **Edge cases**: `null`/`undefined` optional fields, empty string treated as `null`

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

Every server action must test:
1. **Unauthenticated** — `userId` is null → returns `{ error: "Unauthorized" }`
2. **Non-admin / insufficient permission** — returns appropriate error
3. **Validation error** — invalid input → returns `{ error: "..." }`
4. **Resource not found** — returns `{ error: "... not found" }`
5. **Success** — valid input + correct role → returns `{ success: true, data: ... }`
6. **DB error path** — data layer throws → returns `{ error: "Failed to ..." }`

```typescript
describe("createStationAction", () => {
  it("returns Unauthorized when user is not logged in", async () => {
    mockAuthUserId.value = null;
    expect(await createStationAction({ name: "A", location: "B" }))
      .toEqual({ error: "Unauthorized" });
  });

  it("returns error when DB throws", async () => {
    mockGetUserInfo.mockResolvedValue(adminUser());
    mockCreateStation.mockRejectedValue(new Error("db error"));
    expect(await createStationAction({ name: "A", location: "B" }))
      .toEqual({ error: "Failed to create station" });
  });
});
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

1. **No coverage padding** — every test must assert meaningful behaviour, not just "it didn't throw"
2. **No snapshots** — use explicit `expect(x).toEqual(y)` assertions
3. **Test behaviour, not implementation** — do not test internal function calls unless they represent side effects (e.g., audit log was written, revalidatePath was called)
4. **One concept per test** — keep each `it()` focused on a single scenario
5. **Descriptive names** — write test names as sentences: `"returns error when station is not found"`

---

## Checklist for New Features

When implementing a new feature, do the following before marking it done:

- [ ] Wrote tests for every new exported data function in `data/`
- [ ] Wrote tests for every new server action in `actions.ts`
- [ ] Wrote tests for every new business component in `components/`
- [ ] Ran `npm run test` — all tests pass (0 failures)
- [ ] Ran `npm run test:coverage` — all business logic files remain at ≥ 80% on all metrics
- [ ] No existing tests were broken by the change
