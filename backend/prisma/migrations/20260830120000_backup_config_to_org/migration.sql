-- DB backup is instance-level (one database), so its config moves from Project
-- to Organization. Carry the existing values from the lowest-id project, where
-- the readers used to look.

ALTER TABLE "Organization"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backupCron" TEXT NOT NULL DEFAULT '0 2 * * *',
  ADD COLUMN "backupS3Endpoint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupS3Region" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupS3Bucket" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupS3AccessKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupS3SecretKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupS3Prefix" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupLastRunAt" TIMESTAMP(3),
  ADD COLUMN "backupLastStatus" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backupIncludeReports" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Organization" o SET
  "timezone"             = p."timezone",
  "backupEnabled"        = p."backupEnabled",
  "backupCron"           = p."backupCron",
  "backupS3Endpoint"     = p."backupS3Endpoint",
  "backupS3Region"       = p."backupS3Region",
  "backupS3Bucket"       = p."backupS3Bucket",
  "backupS3AccessKey"    = p."backupS3AccessKey",
  "backupS3SecretKey"    = p."backupS3SecretKey",
  "backupS3Prefix"       = p."backupS3Prefix",
  "backupLastRunAt"      = p."backupLastRunAt",
  "backupLastStatus"     = p."backupLastStatus",
  "backupIncludeReports" = p."backupIncludeReports"
FROM (SELECT * FROM "Project" ORDER BY "id" ASC LIMIT 1) p
WHERE p."orgId" = o."id";

ALTER TABLE "Project"
  DROP COLUMN "backupEnabled",
  DROP COLUMN "backupCron",
  DROP COLUMN "backupS3Endpoint",
  DROP COLUMN "backupS3Region",
  DROP COLUMN "backupS3Bucket",
  DROP COLUMN "backupS3AccessKey",
  DROP COLUMN "backupS3SecretKey",
  DROP COLUMN "backupS3Prefix",
  DROP COLUMN "backupLastRunAt",
  DROP COLUMN "backupLastStatus",
  DROP COLUMN "backupIncludeReports";
