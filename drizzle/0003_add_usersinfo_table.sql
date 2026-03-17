-- Create usersinfo table to store user profile information
CREATE TABLE "usersinfo" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"car_number_plate" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usersinfo_car_number_plate_unique" UNIQUE("car_number_plate")
);
--> statement-breakpoint

-- Note: Foreign key constraint from sessions to usersinfo is NOT added by this migration
-- This is because existing sessions may reference user_ids that don't yet exist in usersinfo
-- To add the foreign key later, run:
-- ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_usersinfo_user_id_fk" 
--   FOREIGN KEY ("user_id") REFERENCES "public"."usersinfo"("user_id") 
--   ON DELETE no action ON UPDATE no action;
