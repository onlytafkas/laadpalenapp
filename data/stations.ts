import { db } from "@/db";
import { stations, sessions } from "@/db/schema";
import { asc, eq, count } from "drizzle-orm";

export async function getAllStations() {
  const allStations = await db
    .select()
    .from(stations)
    .orderBy(asc(stations.name));

  return allStations;
}

export async function createStation(data: { name: string; description?: string }) {
  const [station] = await db
    .insert(stations)
    .values({
      name: data.name,
      description: data.description || null,
    })
    .returning();

  return station;
}

export async function updateStation(data: { id: number; name: string; description?: string }) {
  const [station] = await db
    .update(stations)
    .set({
      name: data.name,
      description: data.description || null,
    })
    .where(eq(stations.id, data.id))
    .returning();

  return station;
}

export async function deleteStation(id: number) {
  await db.delete(stations).where(eq(stations.id, id));
}

export async function checkStationHasSessions(stationId: number): Promise<boolean> {
  const result = await db
    .select({ count: count() })
    .from(sessions)
    .where(eq(sessions.stationId, stationId));

  return result[0].count > 0;
}

export async function getStationById(id: number) {
  const [station] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id));

  return station ?? null;
}
