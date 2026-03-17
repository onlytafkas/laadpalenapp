# Laadpalen App - AI Agent Instructions

This document serves as the main orchestration file for AI coding assistants working on the Laadpalen App project.

## Purpose

This project is a charging station (laadpalen) management application built with Next.js, TypeScript, and modern web technologies. When providing code assistance, always adhere to the project's established patterns and conventions.

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

## Architectural Layer Instructions

For specific implementation details, refer to these instruction files in the `/docs` directory:

- **[Authentication](docs/authentication.md)**: Clerk authentication setup, protected routes, and modal configuration
- **[UI Components](docs/ui-components.md)**: shadcn/ui component usage and composition patterns

## Before Making Changes

> **CRITICAL**: Always read the relevant documentation file(s) from `/docs` BEFORE generating any code. This ensures compliance with project standards and prevents violations of architectural rules.

1. **Review** the applicable instruction file(s) in `/docs` for the feature area you're working on
2. **Match** existing code patterns and conventions in the project
3. **Validate** that changes maintain type safety and don't introduce errors
4. **Consider** the impact on related components and files
