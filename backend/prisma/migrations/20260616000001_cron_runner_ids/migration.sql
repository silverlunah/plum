-- Add runnerIds column to store multiple runner IDs as a comma-separated string.
-- Existing jobs that already have a single runnerId are migrated to it;
-- everything else defaults to 'built-in'.
ALTER TABLE "CronJob" ADD COLUMN "runnerIds" TEXT NOT NULL DEFAULT 'built-in';

UPDATE "CronJob" SET "runnerIds" = "runnerId" WHERE "runnerId" IS NOT NULL;
