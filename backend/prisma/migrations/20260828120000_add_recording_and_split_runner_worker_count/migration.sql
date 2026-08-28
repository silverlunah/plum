-- AlterTable: split the overloaded `runners` column into explicit runnerCount
-- (distinct runner machines/lanes) and workerCount (Cucumber --parallel workers
-- within a runner) — the old column meant one or the other depending on which
-- code path wrote it.
ALTER TABLE "Report" ADD COLUMN "runnerCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Report" ADD COLUMN "workerCount" INTEGER NOT NULL DEFAULT 1;

-- Backfill: distributed runs stored a comma-joined runnerName (see
-- reportService.saveCombinedReport) and used `runners` for lane count.
-- Everything else used `runners` for the Cucumber --parallel worker count.
UPDATE "Report"
SET "runnerCount" = "runners", "workerCount" = 1
WHERE "runnerName" LIKE '%, %';

UPDATE "Report"
SET "runnerCount" = 1, "workerCount" = "runners"
WHERE "runnerName" IS NULL OR "runnerName" NOT LIKE '%, %';

ALTER TABLE "Report" DROP COLUMN "runners";

-- CreateTable: one row per (report, scenario, worker, browser tab). `events`
-- is a gzip-compressed JSON array of rrweb events.
CREATE TABLE "Recording" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "workerId" INTEGER NOT NULL DEFAULT 1,
    "tabId" TEXT NOT NULL DEFAULT 'main',
    "tabIndex" INTEGER NOT NULL DEFAULT 0,
    "events" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recording_reportId_idx" ON "Recording"("reportId");
CREATE INDEX "Recording_reportId_scenarioId_idx" ON "Recording"("reportId", "scenarioId");

ALTER TABLE "Recording" ADD CONSTRAINT "Recording_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
