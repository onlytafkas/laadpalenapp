import { db } from "@/db";
import { sessions, stations } from "@/db/schema";
import { eq, desc, and, ne, gt, lte, or, isNull } from "drizzle-orm";

/** Strips seconds and milliseconds so timestamps are stored at minute precision. */
function toMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

const sessionWithStationSelect = {
  id: sessions.id,
  userId: sessions.userId,
  stationId: sessions.stationId,
  startTime: sessions.startTime,
  endTime: sessions.endTime,
  reminderStartSent: sessions.reminderStartSent,
  reminderEndSent: sessions.reminderEndSent,
  station: stations,
};

export async function getUserLoadingSessions(userId: string) {
  return db
    .select(sessionWithStationSelect)
    .from(sessions)
    .innerJoin(stations, eq(sessions.stationId, stations.id))
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.startTime));
}

export async function getAllLoadingSessions() {
  return db
    .select(sessionWithStationSelect)
    .from(sessions)
    .innerJoin(stations, eq(sessions.stationId, stations.id))
    .orderBy(desc(sessions.startTime));
}

interface CreateLoadingSessionInput {
  userId: string;
  stationId: number;
  startTime?: string;
  endTime?: string;
}

export async function createLoadingSession(data: CreateLoadingSessionInput) {
  const values: {
    userId: string;
    stationId: number;
    startTime: Date;
    endTime?: Date;
  } = {
    userId: data.userId,
    stationId: data.stationId,
    startTime: toMinute(data.startTime ? new Date(data.startTime) : new Date()),
  };

  if (data.endTime) {
    values.endTime = toMinute(new Date(data.endTime));
  }

  const [session] = await db
    .insert(sessions)
    .values(values)
    .returning();

  return session;
}

interface UpdateLoadingSessionInput {
  id: number;
  stationId: number;
  startTime?: string;
  endTime?: string;
}

export async function updateLoadingSession(data: UpdateLoadingSessionInput) {
  const values: {
    stationId: number;
    startTime?: Date;
    endTime?: Date | null;
  } = {
    stationId: data.stationId,
  };

  if (data.startTime) {
    values.startTime = toMinute(new Date(data.startTime));
  }

  if (data.endTime !== undefined) {
    values.endTime = data.endTime ? toMinute(new Date(data.endTime)) : null;
  }

  const [session] = await db
    .update(sessions)
    .set({
      ...values,
      // Reset reminder flags whenever times are updated so reminders fire again
      // at the new scheduled times.
      reminderStartSent: false,
      reminderEndSent: false,
    })
    .where(eq(sessions.id, data.id))
    .returning();

  return session;
}

export async function deleteLoadingSession(id: number) {
  await db
    .delete(sessions)
    .where(eq(sessions.id, id));
}

export async function getSessionById(id: number) {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });
  return session ?? null;
}

/**
 * Checks if a session would overlap with existing sessions for the same station
 * Sessions must have at least 5 minutes gap between them
 * @param stationId The station ID to check
 * @param startTime Start time of the session
 * @param endTime End time of the session (optional)
 * @param excludeSessionId Session ID to exclude from check (for updates)
 * @returns true if there's an overlap, false otherwise
 */
export async function checkSessionOverlap(
  stationId: number,
  startTime: Date,
  endTime: Date | null,
  excludeSessionId?: number
): Promise<boolean> {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  // Add 5-minute buffer to start and end times
  const bufferedStart = new Date(startTime.getTime() - FIVE_MINUTES_MS);
  const bufferedEnd = endTime
    ? new Date(endTime.getTime() + FIVE_MINUTES_MS)
    : new Date(startTime.getTime() + FIVE_MINUTES_MS);

  // Build the where clause
  const whereConditions = [eq(sessions.stationId, stationId)];

  // Exclude the current session if updating
  if (excludeSessionId !== undefined) {
    whereConditions.push(ne(sessions.id, excludeSessionId));
  }

  // Get all sessions for this station (excluding the current one if updating)
  const existingSessions = await db.query.sessions.findMany({
    where: and(...whereConditions),
  });

  // Check for overlaps
  for (const existingSession of existingSessions) {
    const existingStart = new Date(existingSession.startTime);
    const existingEnd = existingSession.endTime
      ? new Date(existingSession.endTime)
      : new Date(existingStart.getTime() + FIVE_MINUTES_MS); // Assume 5 min if no end time

    // Check if there's an overlap considering the 5-minute buffer
    // Sessions overlap if:
    // - New session starts before existing ends AND
    // - New session ends after existing starts
    if (bufferedStart < existingEnd && bufferedEnd > existingStart) {
      return true; // Overlap detected
    }
  }

  return false; // No overlap
}

/**
 * Finds the next session for a station after a given start time and calculates
 * the maximum allowed end time (with 5-minute gap)
 * @param stationId The station ID to check
 * @param startTime Start time of the session
 * @param excludeSessionId Session ID to exclude from check (for updates)
 * @returns The maximum allowed end time, or null if no constraint
 */
export async function findMaxEndTime(
  stationId: number,
  startTime: Date,
  excludeSessionId?: number
): Promise<Date | null> {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  // Build the where clause to find sessions starting after our start time
  const whereConditions = [
    eq(sessions.stationId, stationId),
    gt(sessions.startTime, startTime),
  ];

  // Exclude the current session if updating
  if (excludeSessionId !== undefined) {
    whereConditions.push(ne(sessions.id, excludeSessionId));
  }

  // Get the next session after this start time
  const nextSessions = await db.query.sessions.findMany({
    where: and(...whereConditions),
    orderBy: [sessions.startTime], // Get the earliest one
    limit: 1,
  });

  if (nextSessions.length === 0) {
    return null; // No next session, no constraint
  }

  const nextSession = nextSessions[0];
  const nextSessionStart = new Date(nextSession.startTime);

  // Maximum end time is 5 minutes before the next session starts
  const maxEndTime = new Date(nextSessionStart.getTime() - FIVE_MINUTES_MS);

  return maxEndTime;
}

/**
 * Finds the next available start time for a session at a station.
 * Walks forward through consecutive/chained sessions (each 5 min apart) until
 * a truly free slot is found, so back-to-back reservations are all accounted for.
 * @param stationId The station ID to check
 * @param requestedStartTime The desired start time
 * @param excludeSessionId Session ID to exclude from check (for updates)
 * @returns The next available start time, or null if the requested time is already free
 */
export async function findNextAvailableStartTime(
  stationId: number,
  requestedStartTime: Date,
  excludeSessionId?: number
): Promise<Date | null> {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  // Build the where clause
  const whereConditions = [eq(sessions.stationId, stationId)];
  if (excludeSessionId !== undefined) {
    whereConditions.push(ne(sessions.id, excludeSessionId));
  }

  // Get all sessions for this station
  const existingSessions = await db.query.sessions.findMany({
    where: and(...whereConditions),
    orderBy: [sessions.startTime],
  });

  // Iteratively advance past consecutive conflicts.
  // e.g. if session A ends at 19:00 and session B starts at 19:05 (ends 21:05),
  // a request for 17:30 must skip both and land at 21:10, not just 19:05.
  let candidateTime = new Date(requestedStartTime);

  for (let i = 0; i <= existingSessions.length; i++) {
    let latestConflictingEndTime: Date | null = null;

    for (const existingSession of existingSessions) {
      const existingStart = new Date(existingSession.startTime);
      const existingEnd = existingSession.endTime
        ? new Date(existingSession.endTime)
        : new Date(existingStart.getTime() + FIVE_MINUTES_MS);

      // Conflict: the existing session ends after candidateTime AND starts within
      // 5 minutes after candidateTime (i.e. there is no 5-min gap).
      const conflictThreshold = new Date(candidateTime.getTime() + FIVE_MINUTES_MS);
      if (existingEnd > candidateTime && existingStart < conflictThreshold) {
        if (!latestConflictingEndTime || existingEnd > latestConflictingEndTime) {
          latestConflictingEndTime = existingEnd;
        }
      }
    }

    if (!latestConflictingEndTime) {
      break; // No conflict at candidateTime — we found the free slot
    }

    // Advance past this conflict and try again
    candidateTime = new Date(latestConflictingEndTime.getTime() + FIVE_MINUTES_MS);
  }

  // If candidateTime never moved, the original time was already free
  if (candidateTime.getTime() === requestedStartTime.getTime()) {
    return null;
  }

  return candidateTime;
}

/**
 * Checks if the user must wait before creating a new reservation.
 * The proposed start time must be at least 4 hours after the user's last reservation end time.
 * @param userId The user ID to check
 * @param proposedStartTime The start time of the new session being created
 * @param excludeSessionId Optional session ID to exclude (for updates)
 * @returns { valid: boolean, message?: string, nextAvailableTime?: Date }
 */
export async function checkCooldownConstraint(
  userId: string,
  proposedStartTime: Date,
  excludeSessionId?: number
): Promise<{ valid: boolean; message?: string; nextAvailableTime?: Date }> {
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

  const whereConditions = [eq(sessions.userId, userId)];
  if (excludeSessionId !== undefined) {
    whereConditions.push(ne(sessions.id, excludeSessionId));
  }

  const userSessions = await db.query.sessions.findMany({
    where: and(...whereConditions),
  });

  if (userSessions.length === 0) {
    return { valid: true };
  }

  // Find the latest end time among all user sessions
  let latestEndTime: Date | null = null;
  for (const s of userSessions) {
    if (s.endTime) {
      const endTime = new Date(s.endTime);
      if (!latestEndTime || endTime > latestEndTime) {
        latestEndTime = endTime;
      }
    }
  }

  if (!latestEndTime) {
    return { valid: true }; // No sessions with a known end time
  }

  const nextAvailableTime = new Date(latestEndTime.getTime() + FOUR_HOURS_MS);

  if (proposedStartTime < nextAvailableTime) {
    return {
      valid: false,
      message: `You must wait 4 hours after your last session ends. You can reserve again from ${nextAvailableTime.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}.`,
      nextAvailableTime,
    };
  }

  return { valid: true };
}

const START_REMINDER_LEAD_MS = 15 * 60_000;
const END_REMINDER_LEAD_MS = 15 * 60_000;
const END_REMINDER_GRACE_MS = 60 * 60_000;

/**
 * Returns sessions eligible for a start reminder.
 * A session becomes eligible 15 minutes before its start time and remains
 * eligible until it ends, provided the reminder has not already been sent.
 */
export async function getSessionsDueForStartReminder() {
  const now = new Date();
  const startThreshold = new Date(now.getTime() + START_REMINDER_LEAD_MS);

  return db
    .select()
    .from(sessions)
    .where(
      and(
        lte(sessions.startTime, startThreshold),
        or(isNull(sessions.endTime), gt(sessions.endTime, now)),
        eq(sessions.reminderStartSent, false)
      )
    );
}

/**
 * Returns sessions eligible for an end reminder.
 * A session becomes eligible 15 minutes before its end time and remains
 * eligible until 1 hour after the end time, provided the reminder has not
 * already been sent.
 */
export async function getSessionsDueForEndReminder() {
  const now = new Date();
  const endThreshold = new Date(now.getTime() + END_REMINDER_LEAD_MS);
  const graceThreshold = new Date(now.getTime() - END_REMINDER_GRACE_MS);

  return db
    .select()
    .from(sessions)
    .where(
      and(
        gt(sessions.endTime, graceThreshold),
        lte(sessions.endTime, endThreshold),
        eq(sessions.reminderEndSent, false)
      )
    );
}

/**
 * Marks the start or end reminder as sent for a given session.
 */
export async function markReminderSent(id: number, type: "start" | "end"): Promise<void> {
  const values =
    type === "start"
      ? { reminderStartSent: true }
      : { reminderEndSent: true };

  await db.update(sessions).set(values).where(eq(sessions.id, id));
}
