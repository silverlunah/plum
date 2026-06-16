-- CreateTable
CREATE TABLE "Runner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Runner_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CronJob" ADD COLUMN "browser" TEXT NOT NULL DEFAULT 'chromium';
ALTER TABLE "CronJob" ADD COLUMN "runnerId" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "browser" TEXT NOT NULL DEFAULT 'chromium';
ALTER TABLE "Report" ADD COLUMN "runnerId" TEXT;
ALTER TABLE "Report" ADD COLUMN "runnerName" TEXT;

-- AddForeignKey
ALTER TABLE "CronJob" ADD CONSTRAINT "CronJob_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
