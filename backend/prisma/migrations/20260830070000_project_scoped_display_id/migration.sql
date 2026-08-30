-- displayId and cron taskName are unique per project now, not globally — two
-- projects can each have TC-001 or a "nightly" schedule.
DROP INDEX "TestSuite_displayId_key";
DROP INDEX "TestCase_displayId_key";
DROP INDEX "CronJob_taskName_key";

CREATE UNIQUE INDEX "TestSuite_projectId_displayId_key" ON "TestSuite"("projectId", "displayId");
CREATE UNIQUE INDEX "TestCase_projectId_displayId_key" ON "TestCase"("projectId", "displayId");
CREATE UNIQUE INDEX "CronJob_projectId_taskName_key" ON "CronJob"("projectId", "taskName");
