import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";

export type AuditStatus =
  | "success"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "error"
  | "confirmation_required";

export type AuditAction =
  | "CREATE_SESSION"
  | "UPDATE_SESSION"
  | "DELETE_SESSION"
  | "TRIGGER_SESSION_REMINDERS"
  | "CREATE_STATION"
  | "UPDATE_STATION"
  | "DELETE_STATION"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DEACTIVATE_USER"
  | "ACTIVATE_USER";

export type AuditEntityType = "session" | "station" | "user";

interface InsertAuditLogInput {
  performedByUserId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  status: AuditStatus;
  errorMessage?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function insertAuditLog(entry: InsertAuditLogInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      performedByUserId: entry.performedByUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeData: (entry.beforeData ?? null) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterData: (entry.afterData ?? null) as any,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    // Audit failures must never break the calling action
    console.error("[audit] Failed to insert audit log:", err);
  }
}

export async function getAllAuditLogs() {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt));
}
