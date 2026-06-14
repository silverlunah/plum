-- CreateTable
CREATE TABLE "CronJob" (
    "id" SERIAL NOT NULL,
    "taskName" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "workers" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'manual-trigger',
    "runners" INTEGER NOT NULL DEFAULT 1,
    "cronJobId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CronJob_taskName_key" ON "CronJob"("taskName");

-- CreateIndex
CREATE UNIQUE INDEX "Report_fileName_key" ON "Report"("fileName");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_cronJobId_fkey" FOREIGN KEY ("cronJobId") REFERENCES "CronJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
