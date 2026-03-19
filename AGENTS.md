# Charging Stations App - AI Agent Instructions

This document serves as the main orchestration file for AI coding assistants working on the Charging Stations App project.

## Purpose

This project is a charging station management application built with Next.js, TypeScript, and modern web technologies. When providing code assistance, always adhere to the project's established patterns and conventions.

## Quick Reference

### Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5 (strict mode)
- **UI Library**: React 19
- **Styling**: Tailwind CSS v4, shadcn/ui components
- **Database**: Neon PostgreSQL with Drizzle ORM
- **Authentication**: Clerk
- **Icons**: Lucide React

### Key Principles

1. **Type Safety First**: Always use TypeScript with strict mode enabled. Never use `any` unless absolutely necessary.
2. **Server Components by Default**: Use React Server Components unless client interactivity is required (marked with `"use client"`).
3. **Path Aliases**: Use `@/` for absolute imports from the project root.
4. **Component Composition**: Leverage shadcn/ui components and extend them when needed.
5. **Database Type Safety**: Use Drizzle ORM's type inference for database operations.
6. **Accessibility**: Ensure all components meet WCAG 2.1 AA standards.
7. **🚫 NEVER USE middleware.ts**: Do NOT create or use `middleware.ts` as it is deprecated in later versions of Next.js (including the version used in this project). **ALWAYS use `proxy.ts` instead** for handling middleware-like functionality such as request interception, authentication checks, or redirects.
8. **⚠️ NEVER MODIFY FONTS**: The Geist fonts are configured in `app/layout.tsx` and MUST NOT be removed or changed.
9. **🧪 Tests Are Mandatory**: Every new data function, server action, and business component MUST have both unit tests AND integration tests. Every new user-facing feature, admin workflow, auth flow, or end-to-end journey MUST also have a meaningful Playwright E2E test. Tests must be **meaningful** — each test covers a distinct scenario (happy path, error path, edge case, branch). All business logic files must maintain ≥ 80% coverage (Stmts, Branch, Funcs, Lines). Run `npm run test` and `npm run test:integration` after every change to confirm no regressions, run `npm run test:coverage` to verify thresholds are still met, and run `npm run test:e2e` whenever the change affects real browser flows. **Always read `.github/instructions/testing.instructions.md` before writing or modifying any code.**
10. **🔢 Semantic Versioning Is Required**: Apply Semantic Versioning 2.0.0 to any change that affects the product surface. Use `PATCH` for backward-compatible fixes, `MINOR` for backward-compatible features, and `MAJOR` for breaking changes. Keep `package.json`, UI version display, and release notes aligned.
11. **🧹 E2E Branch Cleanup Is Required**: Any workflow that creates temporary Neon branches for Playwright or other E2E validation MUST delete them when finished and prune stale `e2e/*` branches before retrying if branch limits are reached.
12. **📝 Capture Reusable Lessons**: When a fix reveals a reusable testing or workflow rule, add that lesson to the relevant instruction file so future changes inherit it instead of relearning it.

## Workflow for Code Generation

1. **READ FIRST**: Read `.github/instructions/testing.instructions.md` and any other relevant instruction file(s) for your task before writing a single line of code. For changes that affect releases, fixes, features, or breaking changes, also read `.github/instructions/release-management.instructions.md`.
2. **UNDERSTAND**: Review existing code patterns in the project
3. **PLAN**: Ensure your approach follows the documented standards
4. **IMPLEMENT**: Generate code that matches the patterns and rules
5. **TEST**: Write **meaningful** unit tests AND integration tests for every changed data function, server action, and component. Add or update Playwright E2E tests for every new or changed user-visible flow. Cover every new branch: happy path, error/catch paths, null/edge cases, and real browser journeys where applicable. Mirror the source path under `__tests__/integration/`, and keep browser workflows under `e2e/tests/` with shared selectors in `e2e/pages/`.
6. **VALIDATE**: Run `npm run test` (all pass), `npm run test:integration` (all pass), then `npm run test:coverage` (all business logic files ≥ 80% Stmts/Branch/Funcs/Lines). Run `npm run test:e2e` for changes that affect real browser flows, and ensure any temporary Neon E2E branches are deleted afterward. If coverage drops, add tests before finishing — do not skip this step.
