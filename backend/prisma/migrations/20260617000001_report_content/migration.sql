-- Clear all existing reports (no production data to preserve)
TRUNCATE TABLE "Report" CASCADE;

-- Drop the old filename-based column
ALTER TABLE "Report" DROP COLUMN "fileName";

-- Add the full report content as JSONB
ALTER TABLE "Report" ADD COLUMN "content" JSONB NOT NULL DEFAULT '{}';
