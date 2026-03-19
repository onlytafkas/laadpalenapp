ALTER TABLE sessions
  ADD COLUMN reminder_start_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reminder_end_sent   BOOLEAN NOT NULL DEFAULT false;
