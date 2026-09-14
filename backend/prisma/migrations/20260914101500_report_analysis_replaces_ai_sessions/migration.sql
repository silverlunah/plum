-- DropTable
DROP TABLE "AiSession";

-- CreateTable
CREATE TABLE "ReportAnalysis" (
    "id" TEXT NOT NULL,
    "reportId" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'analyzing',
    "verdict" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "findings" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL DEFAULT '',
    "prUrl" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "workspacePath" TEXT NOT NULL DEFAULT '',
    "allowedRunnerIds" TEXT NOT NULL DEFAULT 'built-in',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportAnalysis_reportId_idx" ON "ReportAnalysis"("reportId");

-- CreateIndex
CREATE INDEX "ReportAnalysis_createdById_idx" ON "ReportAnalysis"("createdById");

-- AddForeignKey
ALTER TABLE "ReportAnalysis" ADD CONSTRAINT "ReportAnalysis_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAnalysis" ADD CONSTRAINT "ReportAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
