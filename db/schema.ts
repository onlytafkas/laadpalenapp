import { pgTable, integer, text, timestamp, serial, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Stations table
export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
});

// Users info table
export const usersinfo = pgTable('usersinfo', {
  userId: text('user_id').primaryKey(),
  carNumberPlate: text('car_number_plate').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').notNull(),
  stationId: integer('station_id')
    .notNull()
    .references(() => stations.id),
  startTime: timestamp('start_time').notNull().defaultNow(),
  endTime: timestamp('end_time'),
});

// Relations
export const stationsRelations = relations(stations, ({ many }) => ({
  sessions: many(sessions),
}));

export const usersinfoRelations = relations(usersinfo, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  station: one(stations, {
    fields: [sessions.stationId],
    references: [stations.id],
  }),
  user: one(usersinfo, {
    fields: [sessions.userId],
    references: [usersinfo.userId],
  }),
}));
