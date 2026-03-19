import { db } from "@/db";
import { usersinfo, sessions } from "@/db/schema";
import { asc, eq, count } from "drizzle-orm";

export async function getAllUsers() {
  const allUsers = await db
    .select()
    .from(usersinfo)
    .orderBy(asc(usersinfo.userId));

  return allUsers;
}

export async function createUser(data: { 
  userId: string; 
  carNumberPlate: string;
  mobileNumber?: string | null;
  isActive?: boolean;
}) {
  const [user] = await db
    .insert(usersinfo)
    .values({
      userId: data.userId,
      carNumberPlate: data.carNumberPlate,
      mobileNumber: data.mobileNumber ?? null,
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return user;
}

export async function updateUser(data: { 
  userId: string; 
  carNumberPlate: string;
  mobileNumber?: string | null;
  isActive: boolean;
  isAdmin: boolean;
}) {
  const [user] = await db
    .update(usersinfo)
    .set({
      carNumberPlate: data.carNumberPlate,
      mobileNumber: data.mobileNumber ?? null,
      isActive: data.isActive,
      isAdmin: data.isAdmin,
      updatedAt: new Date(),
    })
    .where(eq(usersinfo.userId, data.userId))
    .returning();

  return user;
}

export async function deactivateUser(userId: string) {
  const [user] = await db
    .update(usersinfo)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(usersinfo.userId, userId))
    .returning();

  return user;
}

export async function activateUser(userId: string) {
  const [user] = await db
    .update(usersinfo)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(usersinfo.userId, userId))
    .returning();

  return user;
}

export async function getUserInfo(userId: string) {
  const user = await db
    .select()
    .from(usersinfo)
    .where(eq(usersinfo.userId, userId))
    .limit(1);

  return user[0] ?? null;
}

export async function checkUserHasSessions(userId: string): Promise<boolean> {
  const result = await db
    .select({ count: count() })
    .from(sessions)
    .where(eq(sessions.userId, userId));

  return result[0].count > 0;
}
