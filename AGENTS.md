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

## Workflow for Code Generation

1. **READ FIRST**: Consult the relevant instruction file(s) for your task
2. **UNDERSTAND**: Review existing code patterns in the project
3. **PLAN**: Ensure your approach follows the documented standards
4. **IMPLEMENT**: Generate code that matches the patterns and rules
5. **VALIDATE**: Check that changes maintain type safety and architectural compliance
