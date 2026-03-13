# Agent Instructions — Laadpalen App

This file provides coding standards and architectural guidance for LLMs working on this codebase. All rules below must be followed when generating or modifying code.

---

## 🚨 CRITICAL REQUIREMENT — READ DOCS FIRST

**YOU MUST READ THE RELEVANT DOCUMENTATION FILES BEFORE GENERATING ANY CODE.**

Detailed, topic-specific instructions are located in the `/docs` directory. These files contain mandatory patterns, conventions, and implementation rules that CANNOT be inferred from this file alone.

**WORKFLOW:**
1. **Identify** which topic(s) your task involves (auth, UI, database, etc.)
2. **Read** the corresponding `.md` file(s) from `/docs` using the `read_file` tool
3. **Follow** the patterns and rules defined in those files
4. **Then** generate code

**Failure to read the relevant documentation will result in incorrect implementations.**

| Topic | File | When to Read |
|-------|------|--------------|
| Authentication | [docs/auth.md](docs/auth.md) | Any auth-related features, user sessions, protected routes |
| UI Components | [docs/ui.md](docs/ui.md) | Creating or modifying any UI components, forms, layouts |

---


## Non-Negotiable Rules

The following rules apply everywhere and are not overridden by any doc:

1. **TypeScript strict mode is on.** No `any`, no `@ts-ignore`, no unsafe casts.
2. **App Router only.** Never use the Pages Router or its data-fetching APIs.
3. **Server Components by default.** Only add `"use client"` when required.
4. **No custom auth.** All authentication goes through Clerk.
5. **No raw SQL.** All database access goes through Drizzle ORM.
6. **`cn()` for all class merging.** Never concatenate Tailwind strings manually.
7. **No inline styles.** Use Tailwind utilities or CSS custom properties.
8. **Named exports for components.** Exception: Next.js page/layout files must default-export.
9. **`function` keyword for React components.** No arrow-function component definitions.
10. **Lucide React for icons.** Do not install other icon libraries.

---

## Project Context

**Laadpalen App** is a Dutch EV charging station management application built with:
- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS v4 + shadcn/ui (radix-nova style)
- Clerk for auth + Drizzle ORM + Neon (PostgreSQL)
