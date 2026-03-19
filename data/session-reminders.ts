import {
  getSessionsDueForStartReminder,
  getSessionsDueForEndReminder,
  markReminderSent,
} from "@/data/loading-sessions";
import { getStationById } from "@/data/stations";
import { sendSessionEventSms } from "@/lib/session-sms";

export interface SessionReminderRunResult {
  startReminders: number;
  endReminders: number;
}

export async function triggerSessionReminders(): Promise<SessionReminderRunResult> {
  const [startSessions, endSessions] = await Promise.all([
    getSessionsDueForStartReminder(),
    getSessionsDueForEndReminder(),
  ]);

  let startReminders = 0;
  let endReminders = 0;

  for (const session of startSessions) {
    try {
      const station = await getStationById(session.stationId);
      await sendSessionEventSms({
        eventType: "start_reminder",
        userId: session.userId,
        stationName: station?.name ?? `Station ${session.stationId}`,
        startTime: session.startTime,
        endTime: session.endTime,
      });
      await markReminderSent(session.id, "start");
      startReminders++;
    } catch (error) {
      console.error(`Failed to send start reminder for session ${session.id}:`, error);
    }
  }

  for (const session of endSessions) {
    try {
      const station = await getStationById(session.stationId);
      await sendSessionEventSms({
        eventType: "end_reminder",
        userId: session.userId,
        stationName: station?.name ?? `Station ${session.stationId}`,
        startTime: session.startTime,
        endTime: session.endTime,
      });
      await markReminderSent(session.id, "end");
      endReminders++;
    } catch (error) {
      console.error(`Failed to send end reminder for session ${session.id}:`, error);
    }
  }

  return { startReminders, endReminders };
}