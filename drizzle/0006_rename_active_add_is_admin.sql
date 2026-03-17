ALTER TABLE "usersinfo" RENAME COLUMN "active" TO "is_active";
ALTER TABLE "usersinfo" ADD COLUMN "is_admin" boolean NOT NULL DEFAULT false;
