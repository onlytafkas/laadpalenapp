import { pgTable, integer, text, timestamp, serial, boolean, json } from 'drizzle-orm/pg-core';
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
  mobileNumber: text('mobile_number'),
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
  reminderStartSent: boolean('reminder_start_sent').notNull().default(false),
  reminderEndSent: boolean('reminder_end_sent').notNull().default(false),
});

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  performedByUserId: text('performed_by_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  beforeData: json('before_data'),
  afterData: json('after_data'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
