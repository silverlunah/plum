-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "content" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TestRun" ALTER COLUMN "status" SET DEFAULT 'backlog';

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_testRunId_idx" ON "Report"("testRunId");

-- CreateIndex
CREATE INDEX "Report_runnerId_idx" ON "Report"("runnerId");

-- CreateIndex
CREATE INDEX "Report_cronJobId_idx" ON "Report"("cronJobId");

-- CreateIndex
CREATE INDEX "TestCase_suiteId_idx" ON "TestCase"("suiteId");

-- CreateIndex
CREATE INDEX "TestCaseHistory_caseId_idx" ON "TestCaseHistory"("caseId");

-- CreateIndex
CREATE INDEX "TestCaseHistory_runId_idx" ON "TestCaseHistory"("runId");

-- CreateIndex
CREATE INDEX "TestCaseHistory_reportId_idx" ON "TestCaseHistory"("reportId");

-- CreateIndex
CREATE INDEX "TestRun_createdAt_idx" ON "TestRun"("createdAt");

-- CreateIndex
CREATE INDEX "TestRunEntry_runId_idx" ON "TestRunEntry"("runId");

-- CreateIndex
CREATE INDEX "TestRunEntry_caseId_idx" ON "TestRunEntry"("caseId");

-- CreateIndex
CREATE INDEX "TestSuite_createdAt_idx" ON "TestSuite"("createdAt");
