-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "anthropicApiKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "anthropicModel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "githubToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "openaiApiKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "openaiModel" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "aiCodePractices" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "aiSystemPrompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "githubDefaultBranch" TEXT NOT NULL DEFAULT 'main',
ADD COLUMN     "githubOwner" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "githubRepo" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AiSession" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL DEFAULT '',
    "workspacePath" TEXT NOT NULL DEFAULT '',
    "reportId" INTEGER,
    "prUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSession_projectId_idx" ON "AiSession"("projectId");

-- CreateIndex
CREATE INDEX "AiSession_createdById_idx" ON "AiSession"("createdById");

-- CreateIndex
CREATE INDEX "AiSession_reportId_idx" ON "AiSession"("reportId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");

-- AddForeignKey
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
