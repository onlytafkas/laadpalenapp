"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createLoadingSession, updateLoadingSession, deleteLoadingSession, getSessionById, checkSessionOverlap, findNextAvailableStartTime, checkCooldownConstraint } from "@/data/loading-sessions";
import { createStation, updateStation, deleteStation, checkStationHasSessions } from "@/data/stations";
import { createUser, updateUser, deactivateUser, activateUser, getUserInfo } from "@/data/usersinfo";
import { revalidatePath } from "next/cache";

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
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Validate input
  try {
    createSessionSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Invalid input" };
  }

  // 3. Check that the user has a registered userinfo record
  const userInfo = await getUserInfo(userId);
  if (!userInfo) {
    return { error: "Your account is not registered in the system. Please contact an administrator to add your user information before making a reservation." };
  }

  // 4. Check that the session is not beyond the day after today
  const startTime = new Date(data.startTime);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  if (startTime > tomorrow) {
    return { error: "You can only reserve up to the day after today." };
  }

  // 4. Check cooldown: user must wait 4 hours after their last session end time
  try {
    const cooldownCheck = await checkCooldownConstraint(userId, new Date(data.startTime));
    if (!cooldownCheck.valid) {
      return { error: cooldownCheck.message || "You must wait 4 hours after your last session ends before reserving again." };
    }
  } catch (error) {
    console.error("Failed to check cooldown constraint:", error);
    return { error: "Failed to validate reservation cooldown" };
  }

  // 3b. Check for session overlap and ask for confirmation if adjustment needed
  try {
    const startTime = new Date(data.startTime);
    const endTime = data.endTime ? new Date(data.endTime) : null;
    const durationMs = endTime ? endTime.getTime() - startTime.getTime() : 0;

    const hasOverlap = await checkSessionOverlap(
      data.stationId,
      startTime,
      endTime
    );

    if (hasOverlap) {
      const nextAvailableStart = await findNextAvailableStartTime(
        data.stationId,
        startTime
      );

      if (nextAvailableStart) {
        const adjustedEndTime = endTime
          ? new Date(nextAvailableStart.getTime() + durationMs)
          : null;

        const adjustedTimeLabel = nextAvailableStart.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        return {
          needsConfirmation: true as const,
          adjustedStartTime: nextAvailableStart.toISOString(),
          adjustedEndTime: adjustedEndTime ? adjustedEndTime.toISOString() : data.endTime,
          message: `This time slot is taken. The next available slot starts at ${adjustedTimeLabel}. Do you want to reserve at this time instead?`,
        };
      } else {
        return {
          error: "This time slot conflicts with another session. Please choose a different time.",
        };
      }
    }
  } catch (error) {
    console.error("Failed to check session overlap:", error);
    return { error: "Failed to validate session timing" };
  }

  // 4. Create session via data helper
  try {
    const session = await createLoadingSession({
      userId,
      stationId: data.stationId,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    // 5. Revalidate dashboard to show new session
    revalidatePath("/dashboard");

    return { success: true, data: session };
  } catch (error) {
    console.error("Failed to create loading session:", error);
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
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check ownership or admin permission
  const [existingSession, callerInfo] = await Promise.all([
    getSessionById(data.id),
    getUserInfo(userId),
  ]);
  if (!existingSession) {
    return { error: "Session not found" };
  }
  if (existingSession.userId !== userId && !callerInfo?.isAdmin) {
    return { error: "Forbidden" };
  }

  // 3. Validate input
  try {
    updateSessionSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Invalid input" };
  }

  // 3. Check for session overlap and ask for confirmation if adjustment needed
  try {
    const startTime = new Date(data.startTime);
    const endTime = data.endTime ? new Date(data.endTime) : null;
    const durationMs = endTime ? endTime.getTime() - startTime.getTime() : 0;

    const hasOverlap = await checkSessionOverlap(
      data.stationId,
      startTime,
      endTime,
      data.id // Exclude current session from overlap check
    );

    if (hasOverlap) {
      const nextAvailableStart = await findNextAvailableStartTime(
        data.stationId,
        startTime,
        data.id
      );

      if (nextAvailableStart) {
        const adjustedEndTime = endTime
          ? new Date(nextAvailableStart.getTime() + durationMs)
          : null;

        const adjustedTimeLabel = nextAvailableStart.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        return {
          needsConfirmation: true as const,
          adjustedStartTime: nextAvailableStart.toISOString(),
          adjustedEndTime: adjustedEndTime ? adjustedEndTime.toISOString() : data.endTime,
          message: `This time slot is taken. The next available slot starts at ${adjustedTimeLabel}. Do you want to update to this time instead?`,
        };
      } else {
        return {
          error: "This time slot conflicts with another session. Please choose a different time.",
        };
      }
    }
  } catch (error) {
    console.error("Failed to check session overlap:", error);
    return { error: "Failed to validate session timing" };
  }

  // 4. Update session via data helper
  try {
    const session = await updateLoadingSession({
      id: data.id,
      stationId: data.stationId,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    // 5. Revalidate dashboard to show updated session
    revalidatePath("/dashboard");

    return { success: true, data: session };
  } catch (error) {
    console.error("Failed to update loading session:", error);
    return { error: "Failed to update charging session" };
  }
}

export async function deleteSession(id: number) {
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check ownership or admin permission
  const [existingSession, callerInfo] = await Promise.all([
    getSessionById(id),
    getUserInfo(userId),
  ]);
  if (!existingSession) {
    return { error: "Session not found" };
  }
  if (existingSession.userId !== userId && !callerInfo?.isAdmin) {
    return { error: "Forbidden" };
  }

  // 3. Delete session via data helper
  try {
    await deleteLoadingSession(id);

    // 3. Revalidate dashboard to remove deleted session
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete loading session:", error);
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
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    createStationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Invalid input" };
  }

  // 3. Create station via data helper
  try {
    const station = await createStation({
      name: data.name,
      description: data.description,
    });

    // 4. Revalidate dashboard to show new station
    revalidatePath("/dashboard");

    return { success: true, data: station };
  } catch (error) {
    console.error("Failed to create station:", error);
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
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    updateStationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Invalid input" };
  }

  // 3. Update station via data helper
  try {
    const station = await updateStation({
      id: data.id,
      name: data.name,
      description: data.description,
    });

    // 4. Revalidate dashboard to show updated station
    revalidatePath("/dashboard");

    return { success: true, data: station };
  } catch (error) {
    console.error("Failed to update station:", error);
    return { error: "Failed to update station. Station name may already exist." };
  }
}

export async function deleteStationAction(id: number) {
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Check if station has any sessions
  try {
    const hasSessions = await checkStationHasSessions(id);
    if (hasSessions) {
      return { error: "Cannot delete station with existing reservations" };
    }

    // 3. Delete station via data helper
    await deleteStation(id);

    // 4. Revalidate dashboard to remove deleted station
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete station:", error);
    return { error: "Failed to delete station" };
  }
}

// ==================== User Actions ====================

const createUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  carNumberPlate: z.string().min(1, "Car number plate is required").max(20),
});

interface CreateUserInput {
  userId: string;
  carNumberPlate: string;
}

export async function createUserAction(data: CreateUserInput) {
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    createUserSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Invalid input" };
  }

  // 3. Create user via data helper
  try {
    const user = await createUser({
      userId: data.userId,
      carNumberPlate: data.carNumberPlate,
      isActive: true,
    });

    // 4. Revalidate dashboard to show new user
    revalidatePath("/dashboard");

    return { success: true, data: user };
  } catch (error) {
    console.error("Failed to create user:", error);
    return { error: "Failed to create user. User ID or car number plate may already exist." };
  }
}

const updateUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  carNumberPlate: z.string().min(1, "Car number plate is required").max(20),
  isActive: z.boolean(),
  isAdmin: z.boolean(),
});

interface UpdateUserInput {
  userId: string;
  carNumberPlate: string;
  isActive: boolean;
  isAdmin: boolean;
}

export async function updateUserAction(data: UpdateUserInput) {
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(userId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Validate input
  try {
    updateUserSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Invalid input" };
  }

  // 3. Update user via data helper
  try {
    const user = await updateUser({
      userId: data.userId,
      carNumberPlate: data.carNumberPlate,
      isActive: data.isActive,
      isAdmin: data.isAdmin,
    });

    // 4. Revalidate dashboard to show updated user
    revalidatePath("/dashboard");

    return { success: true, data: user };
  } catch (error) {
    console.error("Failed to update user:", error);
    return { error: "Failed to update user. Car number plate may already exist." };
  }
}

export async function deactivateUserAction(userId: string) {
  // 1. Check authentication
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(authUserId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Deactivate user via data helper
  try {
    await deactivateUser(userId);

    // 3. Revalidate dashboard to show updated status
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Failed to deactivate user:", error);
    return { error: "Failed to deactivate user" };
  }
}

export async function activateUserAction(userId: string) {
  // 1. Check authentication
  const { userId: authUserId } = await auth();
  if (!authUserId) {
    return { error: "Unauthorized" };
  }

  // 2. Check admin permission
  const callerInfo = await getUserInfo(authUserId);
  if (!callerInfo?.isAdmin) {
    return { error: "Forbidden: Admin access required" };
  }

  // 3. Activate user via data helper
  try {
    await activateUser(userId);

    // 3. Revalidate dashboard to show updated status
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Failed to activate user:", error);
    return { error: "Failed to activate user" };
  }
}
