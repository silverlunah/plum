-- AlterTable Project: add test repository settings and sequence counters
ALTER TABLE "Project" ADD COLUMN "testCasePrefix" TEXT NOT NULL DEFAULT 'TC';
ALTER TABLE "Project" ADD COLUMN "testSuitePrefix" TEXT NOT NULL DEFAULT 'TS';
ALTER TABLE "Project" ADD COLUMN "caseSeqNext" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN "suiteSeqNext" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Report: add relation to TestCaseHistory (no schema change needed here, FK is on history side)

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable TestSuite
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable TestCase
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "automatedTag" TEXT,
    "isAutomated" BOOLEAN NOT NULL DEFAULT false,
    "suiteId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable TestStep
CREATE TABLE "TestStep" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "testData" TEXT NOT NULL DEFAULT '',
    "expectedOutput" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable TestRun
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable TestRunEntry
CREATE TABLE "TestRunEntry" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "TestRunEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable TestCaseHistory
CREATE TABLE "TestCaseHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "runId" TEXT,
    "reportId" INTEGER,
    "result" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT NOT NULL DEFAULT '',
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "TestSuite_displayId_key" ON "TestSuite"("displayId");
CREATE UNIQUE INDEX "TestCase_displayId_key" ON "TestCase"("displayId");

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestStep" ADD CONSTRAINT "TestStep_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunEntry" ADD CONSTRAINT "TestRunEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRunEntry" ADD CONSTRAINT "TestRunEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRunEntry" ADD CONSTRAINT "TestRunEntry_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseHistory" ADD CONSTRAINT "TestCaseHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestCaseHistory" ADD CONSTRAINT "TestCaseHistory_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestCaseHistory" ADD CONSTRAINT "TestCaseHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestCaseHistory" ADD CONSTRAINT "TestCaseHistory_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
