-- Opt-in toggle for including Report/Recording data in exports (manual and
-- scheduled S3). Defaults off — reports can be large (rrweb recordings), and
-- this is new behavior existing installs shouldn't get switched on for silently.
ALTER TABLE "Project" ADD COLUMN "backupIncludeReports" BOOLEAN NOT NULL DEFAULT false;
