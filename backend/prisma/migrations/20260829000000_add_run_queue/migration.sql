-- CreateTable
CREATE TABLE "RunQueue" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'manual-trigger',
    "label" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "tag" TEXT NOT NULL DEFAULT '',
    "workers" INTEGER NOT NULL DEFAULT 1,
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "runnerIds" TEXT NOT NULL DEFAULT 'built-in',
    "testRunId" TEXT,
    "baseUrl" TEXT,
    "runTitle" TEXT,
    "startedBy" TEXT,
    "notifyDiscord" BOOLEAN NOT NULL DEFAULT false,
    "notifySlack" BOOLEAN NOT NULL DEFAULT false,
    "reportId" INTEGER,
    "exitCode" INTEGER,
    "note" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RunQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunQueue_status_queuedAt_idx" ON "RunQueue"("status", "queuedAt");
