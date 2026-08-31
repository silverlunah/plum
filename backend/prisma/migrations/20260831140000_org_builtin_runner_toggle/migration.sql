-- Instance-wide "run tests on the primary" switch, previously a per-browser
-- localStorage flag. An owner sets it; every member's run bar reads it.
ALTER TABLE "Organization" ADD COLUMN "builtInRunnerEnabled" BOOLEAN NOT NULL DEFAULT true;
