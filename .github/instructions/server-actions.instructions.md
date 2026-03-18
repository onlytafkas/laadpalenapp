---
description: Rules for implementing server actions and data mutations in the application. Use when creating or modifying server actions, handling form submissions, or performing database mutations.
---

# Server Actions & Data Mutations

## Core Principles

All data mutations in this application MUST be performed using Next.js Server Actions. Follow these strict rules:

## File Structure

- **File Naming**: Server action files MUST be named `actions.ts`
- **Colocation**: Place `actions.ts` in the same directory as the component that calls it
- **Client Components**: Server actions MUST be called from client components (marked with `"use client"`)

## Implementation Rules

### 1. Error Handling
❌ **Never throw errors** in server actions  
✅ **Always return** an object with `error` or `success` property

```typescript
// ✅ Correct
export async function updateChargingStation(data: UpdateStationInput) {
  // ... validation and logic
  if (error) {
    return { error: "Failed to update station" };
  }
  return { success: true, data: result };
}

// ❌ Wrong
export async function updateChargingStation(data: UpdateStationInput) {
  throw new Error("Failed to update"); // Never do this
}
```

### 2. Type Safety
❌ **Do NOT use** the `FormData` TypeScript type  
✅ **Define explicit** TypeScript interfaces/types for all inputs

```typescript
// ✅ Correct
interface CreateStationInput {
  name: string;
  location: string;
  capacity: number;
}

export async function createStation(data: CreateStationInput) {
  // ...
}

// ❌ Wrong
export async function createStation(data: FormData) {
  // Never use FormData type
}
```

### 3. Validation
**ALL input data MUST be validated using Zod schemas**

```typescript
import { z } from "zod";

const createStationSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  capacity: z.number().positive(),
});

export async function createStation(data: CreateStationInput) {
  const validated = createStationSchema.parse(data);
  // ... continue with validated data
}
```

### 4. Authentication Check
**ALWAYS check for authenticated user FIRST** before any database operations

```typescript
import { auth } from "@clerk/nextjs/server";

export async function createStation(data: CreateStationInput) {
  const { userId } = await auth();
  
  if (!userId) {
    return { error: "Unauthorized" };
  }
  
  // ... proceed with validation and database operations
}
```

### 5. Database Operations
❌ **Never use** Drizzle queries directly in server actions  
✅ **Always use** helper functions from the `/data` directory

```typescript
// ✅ Correct
import { createChargingStation } from "@/data/charging-stations";

export async function addStation(data: CreateStationInput) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };
  
  const validated = createStationSchema.parse(data);
  const station = await createChargingStation(validated);
  
  return { success: true, data: station };
}

// ❌ Wrong
import { db } from "@/db";
import { stations } from "@/db/schema";

export async function addStation(data: CreateStationInput) {
  // Never do direct database queries here
  const station = await db.insert(stations).values(data);
}
```

## Complete Example

```typescript
// app/dashboard/stations/actions.ts
"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { insertAuditLog } from "@/data/audit";
import { createChargingStation } from "@/data/charging-stations";

async function getRequestMetadata() {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const userAgent = headersList.get("user-agent") ?? null;
  return { ipAddress: ip, userAgent };
}

const createStationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().min(1, "Location is required"),
  capacity: z.number().positive("Capacity must be positive"),
});

interface CreateStationInput {
  name: string;
  location: string;
  capacity: number;
}

export async function createStation(data: CreateStationInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "CREATE_STATION", entityType: "station", status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Validate input
  try {
    createStationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", status: "validation_error", errorMessage: error.issues[0].message, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", status: "validation_error", errorMessage: "Invalid input", afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 3. Use data helper function
  try {
    const station = await createChargingStation(data);
    revalidatePath("/dashboard");

    // 4. Return success
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", entityId: String(station.id), status: "success", afterData: station, ...meta });
    return { success: true, data: station };
  } catch (error) {
    // 5. Return error (don't throw)
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", status: "error", errorMessage: "Failed to create charging station", afterData: data, ...meta });
    return { error: "Failed to create charging station" };
  }
}
```

### 6. Audit Logging — MANDATORY

**EVERY server action MUST call `insertAuditLog` at EVERY return point** — both success and failure paths. This ensures a complete, tamper-evident audit trail.

#### Setup
Import the helpers at the top of every `actions.ts` file:

```typescript
import { headers } from "next/headers";
import { insertAuditLog } from "@/data/audit";
```

Add a `getRequestMetadata()` helper inside the file to extract IP and user agent:

```typescript
async function getRequestMetadata() {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const userAgent = headersList.get("user-agent") ?? null;
  return { ipAddress: ip, userAgent };
}
```

#### `insertAuditLog` parameters

| Field | Type | Description |
|---|---|---|
| `performedByUserId` | `string \| null` | From `auth()`. Use `null` when the user is unauthenticated. |
| `action` | `AuditAction` | A constant describing the operation (e.g. `"CREATE_STATION"`). Add new values to the `AuditAction` union in `data/audit.ts`. |
| `entityType` | `AuditEntityType` | The entity being operated on (e.g. `"station"`). Add new values to the `AuditEntityType` union in `data/audit.ts`. |
| `entityId` | `string \| null` | String ID of the affected record. Null on failed creates. |
| `status` | `AuditStatus` | One of: `"success"`, `"unauthorized"`, `"forbidden"`, `"not_found"`, `"validation_error"`, `"error"`, `"confirmation_required"`. |
| `errorMessage` | `string \| null` | Human-readable error text. Null on success. |
| `beforeData` | `unknown` | Snapshot of the record **before** the mutation (for updates/deletes). |
| `afterData` | `unknown` | The input data or resulting record **after** the mutation (for creates/updates). |
| `ipAddress` | `string \| null` | From `getRequestMetadata()`. |
| `userAgent` | `string \| null` | From `getRequestMetadata()`. |

#### Status mapping

| Scenario | `status` value |
|---|---|
| `auth()` returns no userId | `"unauthorized"` |
| User lacks required role/permission | `"forbidden"` |
| Zod validation fails | `"validation_error"` |
| Record to update/delete was not found | `"not_found"` |
| A conflict requiring user confirmation | `"confirmation_required"` |
| Unexpected database/runtime error | `"error"` |
| Operation completed successfully | `"success"` |

#### Before-data strategy

- **Creates**: no `beforeData` (omit or pass `null`)
- **Updates**: fetch the existing record from the `/data` helper **before** the mutation and pass it as `beforeData`
- **Deletes**: same as updates — fetch first, then delete

#### Complete example

```typescript
"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { insertAuditLog } from "@/data/audit";
import { createWidget, getWidgetById, updateWidget } from "@/data/widgets";
import { getUserInfo } from "@/data/usersinfo";

async function getRequestMetadata() {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const userAgent = headersList.get("user-agent") ?? null;
  return { ipAddress: ip, userAgent };
}

const createWidgetSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

interface CreateWidgetInput {
  name: string;
}

export async function createWidgetAction(data: CreateWidgetInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "CREATE_WIDGET", entityType: "widget", status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check permissions
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_WIDGET", entityType: "widget", status: "forbidden", errorMessage: "Admin access required", afterData: data, ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    createWidgetSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "CREATE_WIDGET", entityType: "widget", status: "validation_error", errorMessage: error.issues[0].message, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_WIDGET", entityType: "widget", status: "validation_error", errorMessage: "Invalid input", afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 4. Perform mutation
  try {
    const widget = await createWidget({ name: data.name });
    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "CREATE_WIDGET", entityType: "widget", entityId: String(widget.id), status: "success", afterData: widget, ...meta });
    return { success: true, data: widget };
  } catch (error) {
    console.error("Failed to create widget:", error);
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_WIDGET", entityType: "widget", status: "error", errorMessage: "Failed to create widget", afterData: data, ...meta });
    return { error: "Failed to create widget" };
  }
}
```

#### Extending the audit types

When adding a new entity or action type, update the union types in `data/audit.ts`:

```typescript
// Add to AuditAction:
export type AuditAction =
  | "CREATE_WIDGET"   // ← new
  | "UPDATE_WIDGET"   // ← new
  | "DELETE_WIDGET"   // ← new
  | ... // existing values

// Add to AuditEntityType:
export type AuditEntityType = "widget" | ... // existing values
```

#### Important rules
❌ **Never skip** audit logging for "minor" actions — every mutation must be logged  
❌ **Never let audit failures break the action** — `insertAuditLog` is already wrapped in try/catch internally, so it is safe to `await` without additional error handling  
✅ **Always `await`** `insertAuditLog` before returning, so the log is written before the response  
✅ **Always log the `status` that matches the return**, so the audit trail exactly mirrors what the caller receives  
✅ **Always call `getRequestMetadata()`** at the top of the action function and spread `...meta` into every `insertAuditLog` call

## Checklist

Before committing a server action, verify:
- [ ] File is named `actions.ts`
- [ ] File is colocated with calling component
- [ ] Returns object with `error` or `success` property
- [ ] Uses explicit TypeScript types (not FormData)
- [ ] Validates data with Zod schema
- [ ] Checks for authenticated user first
- [ ] Uses helper functions from `/data` directory
- [ ] Called from client component
- [ ] Imports `insertAuditLog` from `@/data/audit` and `headers` from `next/headers`
- [ ] Has a `getRequestMetadata()` helper that extracts IP and user agent
- [ ] Every `return` statement is preceded by an `await insertAuditLog(...)` call
- [ ] `performedByUserId` is `null` for unauthenticated returns, `userId` otherwise
- [ ] `beforeData` is populated for update and delete operations
- [ ] New entity/action types are added to the unions in `data/audit.ts`
