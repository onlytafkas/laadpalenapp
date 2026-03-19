"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { createLoadingSession, updateLoadingSession, deleteLoadingSession, getSessionById, checkSessionOverlap, findNextAvailableStartTime, checkCooldownConstraint } from "@/data/loading-sessions";
import { createStation, updateStation, deleteStation, checkStationHasSessions, getStationById } from "@/data/stations";
import { createUser, updateUser, deactivateUser, activateUser, getUserInfo } from "@/data/usersinfo";
import { insertAuditLog } from "@/data/audit";
import { revalidatePath } from "next/cache";
import { sendSessionEventSms, type SessionSmsEventType } from "@/lib/session-sms";

async function getRequestMetadata() {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const userAgent = headersList.get("user-agent") ?? null;
  return { ipAddress: ip, userAgent };
}

async function notifySessionEvent(
  eventType: SessionSmsEventType,
  session: {
    userId: string;
    stationId: number;
    startTime: Date | string;
    endTime: Date | string | null;
  }
) {
  const station = await getStationById(session.stationId);

  try {
    await sendSessionEventSms({
      eventType,
      userId: session.userId,
      stationName: station?.name ?? `Station ${session.stationId}`,
      startTime: session.startTime,
      endTime: session.endTime,
    });
  } catch (error) {
    console.error(`Failed to send ${eventType} session SMS:`, error);
  }
}

const createSessionSchema = z.object({
  stationId: z.number().int().positive("Station ID is required"),
  startTime: z.string(),
  endTime: z.string(),
});

interface CreateSessionInput {
  stationId: number;
  startTime: string;
  endTime: string;
}

export async function createSession(data: CreateSessionInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "CREATE_SESSION", entityType: "session", status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Validate input
  try {
    createSessionSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "validation_error", errorMessage: error.issues[0].message, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "validation_error", errorMessage: "Invalid input", afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 3. Check that the user has a registered userinfo record
  const userInfo = await getUserInfo(userId);
  if (!userInfo) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "forbidden", errorMessage: "Account not registered", afterData: data, ...meta });
    return { error: "Your account is not registered in the system. Please contact an administrator to add your user information before making a reservation." };
  }
  if (!userInfo.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "forbidden", errorMessage: "Account deactivated", afterData: data, ...meta });
    return { error: "Your account has been deactivated. Please contact an administrator to restore access." };
  }
  if (!userInfo.mobileNumber?.trim()) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "forbidden", errorMessage: "Mobile number missing", afterData: data, ...meta });
    return { error: "Your mobile number is missing. Please contact an administrator to update your profile before making a reservation." };
  }

  // 4. Check that the session is not beyond the day after today
  const startTime = new Date(data.startTime);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  if (startTime > tomorrow) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "validation_error", errorMessage: "Reservation too far in the future", afterData: data, ...meta });
    return { error: "You can only reserve up to the day after today." };
  }

  // 5. Check cooldown: user must wait 4 hours after their last session end time
  try {
    const cooldownCheck = await checkCooldownConstraint(userId, new Date(data.startTime));
    if (!cooldownCheck.valid) {
      await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "validation_error", errorMessage: cooldownCheck.message ?? "Cooldown constraint violated", afterData: data, ...meta });
      return { error: cooldownCheck.message || "You must wait 4 hours after your last session ends before reserving again." };
    }
  } catch (error) {
    console.error("Failed to check cooldown constraint:", error);
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "error", errorMessage: "Failed to validate reservation cooldown", afterData: data, ...meta });
    return { error: "Failed to validate reservation cooldown" };
  }

  // 6. Check for session overlap and ask for confirmation if adjustment needed
  try {
    const overlapStartTime = new Date(data.startTime);
    const overlapEndTime = data.endTime ? new Date(data.endTime) : null;
    const durationMs = overlapEndTime ? overlapEndTime.getTime() - overlapStartTime.getTime() : 0;

    const hasOverlap = await checkSessionOverlap(
      data.stationId,
      overlapStartTime,
      overlapEndTime
    );

    if (hasOverlap) {
      const nextAvailableStart = await findNextAvailableStartTime(
        data.stationId,
        overlapStartTime
      );

      if (nextAvailableStart) {
        const adjustedEndTime = overlapEndTime
          ? new Date(nextAvailableStart.getTime() + durationMs)
          : null;

        const adjustedTimeLabel = nextAvailableStart.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "confirmation_required", errorMessage: `Overlap detected, suggested start: ${adjustedTimeLabel}`, afterData: data, ...meta });
        return {
          needsConfirmation: true as const,
          adjustedStartTime: nextAvailableStart.toISOString(),
          adjustedEndTime: adjustedEndTime ? adjustedEndTime.toISOString() : data.endTime,
          message: `This time slot is taken. The next available slot starts at ${adjustedTimeLabel}. Do you want to reserve at this time instead?`,
        };
      } else {
        await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "validation_error", errorMessage: "No available slot after overlap", afterData: data, ...meta });
        return {
          error: "This time slot conflicts with another session. Please choose a different time.",
        };
      }
    }
  } catch (error) {
    console.error("Failed to check session overlap:", error);
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "error", errorMessage: "Failed to validate session timing", afterData: data, ...meta });
    return { error: "Failed to validate session timing" };
  }

  // 7. Create session via data helper
  try {
    const session = await createLoadingSession({
      userId,
      stationId: data.stationId,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    await notifySessionEvent("created", session);

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", entityId: String(session.id), status: "success", afterData: session, ...meta });
    return { success: true, data: session };
  } catch (error) {
    console.error("Failed to create loading session:", error);
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_SESSION", entityType: "session", status: "error", errorMessage: "Failed to create charging session", afterData: data, ...meta });
    return { error: "Failed to create charging session" };
  }
}

const updateSessionSchema = z.object({
  id: z.number(),
  stationId: z.number().int().positive("Station ID is required"),
  startTime: z.string(),
  endTime: z.string(),
});

interface UpdateSessionInput {
  id: number;
  stationId: number;
  startTime: string;
  endTime: string;
}

export async function updateSession(data: UpdateSessionInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check ownership or admin permission
  const [existingSession, callerInfo] = await Promise.all([
    getSessionById(data.id),
    getUserInfo(userId),
  ]);
  if (!existingSession) {
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "not_found", errorMessage: "Session not found", afterData: data, ...meta });
    return { error: "Session not found" };
  }
  if (existingSession.userId !== userId && (!callerInfo?.isAdmin || !callerInfo?.isActive)) {
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "forbidden", errorMessage: "Forbidden", beforeData: existingSession, afterData: data, ...meta });
    return { error: "Forbidden" };
  }

  // 3. Validate input
  try {
    updateSessionSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "validation_error", errorMessage: error.issues[0].message, beforeData: existingSession, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "validation_error", errorMessage: "Invalid input", beforeData: existingSession, afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 4. Check for session overlap and ask for confirmation if adjustment needed
  try {
    const overlapStartTime = new Date(data.startTime);
    const overlapEndTime = data.endTime ? new Date(data.endTime) : null;
    const durationMs = overlapEndTime ? overlapEndTime.getTime() - overlapStartTime.getTime() : 0;

    const hasOverlap = await checkSessionOverlap(
      data.stationId,
      overlapStartTime,
      overlapEndTime,
      data.id // Exclude current session from overlap check
    );

    if (hasOverlap) {
      const nextAvailableStart = await findNextAvailableStartTime(
        data.stationId,
        overlapStartTime,
        data.id
      );

      if (nextAvailableStart) {
        const adjustedEndTime = overlapEndTime
          ? new Date(nextAvailableStart.getTime() + durationMs)
          : null;

        const adjustedTimeLabel = nextAvailableStart.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "confirmation_required", errorMessage: `Overlap detected, suggested start: ${adjustedTimeLabel}`, beforeData: existingSession, afterData: data, ...meta });
        return {
          needsConfirmation: true as const,
          adjustedStartTime: nextAvailableStart.toISOString(),
          adjustedEndTime: adjustedEndTime ? adjustedEndTime.toISOString() : data.endTime,
          message: `This time slot is taken. The next available slot starts at ${adjustedTimeLabel}. Do you want to update to this time instead?`,
        };
      } else {
        await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "validation_error", errorMessage: "No available slot after overlap", beforeData: existingSession, afterData: data, ...meta });
        return {
          error: "This time slot conflicts with another session. Please choose a different time.",
        };
      }
    }
  } catch (error) {
    console.error("Failed to check session overlap:", error);
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "error", errorMessage: "Failed to validate session timing", beforeData: existingSession, afterData: data, ...meta });
    return { error: "Failed to validate session timing" };
  }

  // 5. Update session via data helper
  try {
    const session = await updateLoadingSession({
      id: data.id,
      stationId: data.stationId,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    await notifySessionEvent("updated", session);

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "success", beforeData: existingSession, afterData: session, ...meta });
    return { success: true, data: session };
  } catch (error) {
    console.error("Failed to update loading session:", error);
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_SESSION", entityType: "session", entityId: String(data.id), status: "error", errorMessage: "Failed to update charging session", beforeData: existingSession, afterData: data, ...meta });
    return { error: "Failed to update charging session" };
  }
}

export async function deleteSession(id: number) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "DELETE_SESSION", entityType: "session", entityId: String(id), status: "unauthorized", errorMessage: "Unauthorized", ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check ownership or admin permission
  const [existingSession, callerInfo] = await Promise.all([
    getSessionById(id),
    getUserInfo(userId),
  ]);
  if (!existingSession) {
    await insertAuditLog({ performedByUserId: userId, action: "DELETE_SESSION", entityType: "session", entityId: String(id), status: "not_found", errorMessage: "Session not found", ...meta });
    return { error: "Session not found" };
  }
  if (existingSession.userId !== userId && (!callerInfo?.isAdmin || !callerInfo?.isActive)) {
    await insertAuditLog({ performedByUserId: userId, action: "DELETE_SESSION", entityType: "session", entityId: String(id), status: "forbidden", errorMessage: "Forbidden", beforeData: existingSession, ...meta });
    return { error: "Forbidden" };
  }

  // 3. Delete session via data helper
  try {
    await deleteLoadingSession(id);

    await notifySessionEvent("deleted", existingSession);

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "DELETE_SESSION", entityType: "session", entityId: String(id), status: "success", beforeData: existingSession, ...meta });
    return { success: true };
  } catch (error) {
    console.error("Failed to delete loading session:", error);
    await insertAuditLog({ performedByUserId: userId, action: "DELETE_SESSION", entityType: "session", entityId: String(id), status: "error", errorMessage: "Failed to delete charging session", beforeData: existingSession, ...meta });
    return { error: "Failed to delete charging session" };
  }
}

// ==================== Station Actions ====================

const createStationSchema = z.object({
  name: z.string().min(1, "Station name is required").max(100),
  description: z.string().max(500).optional(),
});

interface CreateStationInput {
  name: string;
  description?: string;
}

export async function createStationAction(data: CreateStationInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "CREATE_STATION", entityType: "station", status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", status: "forbidden", errorMessage: "Admin access required", afterData: data, ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
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

  // 4. Create station via data helper
  try {
    const station = await createStation({
      name: data.name,
      description: data.description,
    });

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", entityId: String(station.id), status: "success", afterData: station, ...meta });
    return { success: true, data: station };
  } catch (error) {
    console.error("Failed to create station:", error);
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_STATION", entityType: "station", status: "error", errorMessage: "Failed to create station", afterData: data, ...meta });
    return { error: "Failed to create station. Station name may already exist." };
  }
}

const updateStationSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Station name is required").max(100),
  description: z.string().max(500).optional(),
});

interface UpdateStationInput {
  id: number;
  name: string;
  description?: string;
}

export async function updateStationAction(data: UpdateStationInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "UPDATE_STATION", entityType: "station", entityId: String(data.id), status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_STATION", entityType: "station", entityId: String(data.id), status: "forbidden", errorMessage: "Admin access required", afterData: data, ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    updateStationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "UPDATE_STATION", entityType: "station", entityId: String(data.id), status: "validation_error", errorMessage: error.issues[0].message, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_STATION", entityType: "station", entityId: String(data.id), status: "validation_error", errorMessage: "Invalid input", afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 3b. Fetch existing station for beforeData
  const existingStation = await getStationById(data.id);

  // 4. Update station via data helper
  try {
    const station = await updateStation({
      id: data.id,
      name: data.name,
      description: data.description,
    });

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_STATION", entityType: "station", entityId: String(data.id), status: "success", beforeData: existingStation, afterData: station, ...meta });
    return { success: true, data: station };
  } catch (error) {
    console.error("Failed to update station:", error);
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_STATION", entityType: "station", entityId: String(data.id), status: "error", errorMessage: "Failed to update station", beforeData: existingStation, afterData: data, ...meta });
    return { error: "Failed to update station. Station name may already exist." };
  }
}

export async function deleteStationAction(id: number) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "DELETE_STATION", entityType: "station", entityId: String(id), status: "unauthorized", errorMessage: "Unauthorized", ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "DELETE_STATION", entityType: "station", entityId: String(id), status: "forbidden", errorMessage: "Admin access required", ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Fetch station + check sessions + delete
  const existingStation = await getStationById(id);

  if (!existingStation) {
    await insertAuditLog({ performedByUserId: userId, action: "DELETE_STATION", entityType: "station", entityId: String(id), status: "validation_error", errorMessage: "Station not found", ...meta });
    return { error: "Station not found" };
  }

  try {
    const hasSessions = await checkStationHasSessions(id);
    if (hasSessions) {
      await insertAuditLog({ performedByUserId: userId, action: "DELETE_STATION", entityType: "station", entityId: String(id), status: "validation_error", errorMessage: "Cannot delete station with existing reservations", beforeData: existingStation, ...meta });
      return { error: "Cannot delete station with existing reservations" };
    }

    await deleteStation(id);

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "DELETE_STATION", entityType: "station", entityId: String(id), status: "success", beforeData: existingStation, ...meta });
    return { success: true };
  } catch (error) {
    console.error("Failed to delete station:", error);
    await insertAuditLog({ performedByUserId: userId, action: "DELETE_STATION", entityType: "station", entityId: String(id), status: "error", errorMessage: "Failed to delete station", beforeData: existingStation, ...meta });
    return { error: "Failed to delete station" };
  }
}

// ==================== User Actions ====================

const createUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  carNumberPlate: z.string().min(1, "Car number plate is required").max(20),
  mobileNumber: z.string().min(1, "Mobile number is required").max(30),
});

interface CreateUserInput {
  userId: string;
  carNumberPlate: string;
  mobileNumber: string;
}

export async function createUserAction(data: CreateUserInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "CREATE_USER", entityType: "user", status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_USER", entityType: "user", status: "forbidden", errorMessage: "Admin access required", afterData: data, ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    createUserSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "CREATE_USER", entityType: "user", status: "validation_error", errorMessage: error.issues[0].message, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_USER", entityType: "user", status: "validation_error", errorMessage: "Invalid input", afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 4. Create user via data helper
  try {
    const user = await createUser({
      userId: data.userId,
      carNumberPlate: data.carNumberPlate,
      mobileNumber: data.mobileNumber,
      isActive: true,
    });

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "CREATE_USER", entityType: "user", entityId: user.userId, status: "success", afterData: user, ...meta });
    return { success: true, data: user };
  } catch (error) {
    console.error("Failed to create user:", error);
    await insertAuditLog({ performedByUserId: userId, action: "CREATE_USER", entityType: "user", entityId: data.userId, status: "error", errorMessage: "Failed to create user", afterData: data, ...meta });
    return { error: "Failed to create user. User ID or car number plate may already exist." };
  }
}

const updateUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  carNumberPlate: z.string().min(1, "Car number plate is required").max(20),
  mobileNumber: z.string().min(1, "Mobile number is required").max(30),
  isActive: z.boolean(),
  isAdmin: z.boolean(),
});

interface UpdateUserInput {
  userId: string;
  carNumberPlate: string;
  mobileNumber: string;
  isActive: boolean;
  isAdmin: boolean;
}

export async function updateUserAction(data: UpdateUserInput) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    await insertAuditLog({ performedByUserId: null, action: "UPDATE_USER", entityType: "user", entityId: data.userId, status: "unauthorized", errorMessage: "Unauthorized", afterData: data, ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_USER", entityType: "user", entityId: data.userId, status: "forbidden", errorMessage: "Admin access required", afterData: data, ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    updateUserSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await insertAuditLog({ performedByUserId: userId, action: "UPDATE_USER", entityType: "user", entityId: data.userId, status: "validation_error", errorMessage: error.issues[0].message, afterData: data, ...meta });
      return { error: error.issues[0].message };
    }
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_USER", entityType: "user", entityId: data.userId, status: "validation_error", errorMessage: "Invalid input", afterData: data, ...meta });
    return { error: "Invalid input" };
  }

  // 3b. Fetch existing user for beforeData
  const existingUser = await getUserInfo(data.userId);

  // 4. Update user via data helper
  try {
    const user = await updateUser({
      userId: data.userId,
      carNumberPlate: data.carNumberPlate,
      mobileNumber: data.mobileNumber,
      isActive: data.isActive,
      isAdmin: data.isAdmin,
    });

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_USER", entityType: "user", entityId: data.userId, status: "success", beforeData: existingUser, afterData: user, ...meta });
    return { success: true, data: user };
  } catch (error) {
    console.error("Failed to update user:", error);
    await insertAuditLog({ performedByUserId: userId, action: "UPDATE_USER", entityType: "user", entityId: data.userId, status: "error", errorMessage: "Failed to update user", beforeData: existingUser, afterData: data, ...meta });
    return { error: "Failed to update user. Car number plate may already exist." };
  }
}

export async function deactivateUserAction(userId: string) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    await insertAuditLog({ performedByUserId: null, action: "DEACTIVATE_USER", entityType: "user", entityId: userId, status: "unauthorized", errorMessage: "Unauthorized", ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(authUserId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: authUserId, action: "DEACTIVATE_USER", entityType: "user", entityId: userId, status: "forbidden", errorMessage: "Admin access required", ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Fetch existing user for beforeData
  const existingUser = await getUserInfo(userId);

  // 4. Deactivate user via data helper
  try {
    await deactivateUser(userId);

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: authUserId, action: "DEACTIVATE_USER", entityType: "user", entityId: userId, status: "success", beforeData: existingUser, afterData: { isActive: false }, ...meta });
    return { success: true };
  } catch (error) {
    console.error("Failed to deactivate user:", error);
    await insertAuditLog({ performedByUserId: authUserId, action: "DEACTIVATE_USER", entityType: "user", entityId: userId, status: "error", errorMessage: "Failed to deactivate user", beforeData: existingUser, ...meta });
    return { error: "Failed to deactivate user" };
  }
}

export async function activateUserAction(userId: string) {
  const meta = await getRequestMetadata();

  // 1. Check authentication
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    await insertAuditLog({ performedByUserId: null, action: "ACTIVATE_USER", entityType: "user", entityId: userId, status: "unauthorized", errorMessage: "Unauthorized", ...meta });
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(authUserId);
  if (!callerInfo?.isAdmin || !callerInfo?.isActive) {
    await insertAuditLog({ performedByUserId: authUserId, action: "ACTIVATE_USER", entityType: "user", entityId: userId, status: "forbidden", errorMessage: "Admin access required", ...meta });
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Fetch existing user for beforeData
  const existingUser = await getUserInfo(userId);

  // 4. Activate user via data helper
  try {
    await activateUser(userId);

    revalidatePath("/dashboard");

    await insertAuditLog({ performedByUserId: authUserId, action: "ACTIVATE_USER", entityType: "user", entityId: userId, status: "success", beforeData: existingUser, afterData: { isActive: true }, ...meta });
    return { success: true };
  } catch (error) {
    console.error("Failed to activate user:", error);
    await insertAuditLog({ performedByUserId: authUserId, action: "ACTIVATE_USER", entityType: "user", entityId: userId, status: "error", errorMessage: "Failed to activate user", beforeData: existingUser, ...meta });
    return { error: "Failed to activate user" };
  }
}
