-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- AlterTable: add columns nullable, backfill, then constrain
ALTER TABLE "Project" ADD COLUMN "orgId" INTEGER;
ALTER TABLE "Project" ADD COLUMN "slug" TEXT;
ALTER TABLE "Project" ADD COLUMN "baseUrl" TEXT NOT NULL DEFAULT '';

-- Fresh installs create the Project row lazily on first settings access — make
-- sure one exists so the backfill below has a target.
INSERT INTO "Project" ("id") SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM "Project");
SELECT setval(pg_get_serial_sequence('"Project"', 'id'), GREATEST((SELECT MAX("id") FROM "Project"), 1), true);

INSERT INTO "Organization" ("name", "updatedAt") VALUES ('Default', CURRENT_TIMESTAMP);

UPDATE "Project"
SET "orgId" = (SELECT "id" FROM "Organization" ORDER BY "id" LIMIT 1)
WHERE "orgId" IS NULL;

UPDATE "Project"
SET "slug" = CASE WHEN "id" = (SELECT MIN("id") FROM "Project") THEN 'default' ELSE 'project-' || "id" END
WHERE "slug" IS NULL;

ALTER TABLE "Project" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing user becomes an admin member of the default project.
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role", "createdAt")
SELECT gen_random_uuid()::text, (SELECT MIN("id") FROM "Project"), "id", 'admin', CURRENT_TIMESTAMP
FROM "User";

-- Scope existing test-repo, report, cron and queue rows to the default project.

ALTER TABLE "TestSuite" ADD COLUMN "projectId" INTEGER;
UPDATE "TestSuite" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;
ALTER TABLE "TestSuite" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TestSuite_projectId_idx" ON "TestSuite"("projectId");

ALTER TABLE "TestCase" ADD COLUMN "projectId" INTEGER;
UPDATE "TestCase" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;
ALTER TABLE "TestCase" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TestCase_projectId_idx" ON "TestCase"("projectId");

ALTER TABLE "TestRun" ADD COLUMN "projectId" INTEGER;
UPDATE "TestRun" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;
ALTER TABLE "TestRun" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TestRun_projectId_idx" ON "TestRun"("projectId");

ALTER TABLE "Report" ADD COLUMN "projectId" INTEGER;
UPDATE "Report" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;
ALTER TABLE "Report" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Report_projectId_idx" ON "Report"("projectId");

ALTER TABLE "CronJob" ADD COLUMN "projectId" INTEGER;
UPDATE "CronJob" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;
ALTER TABLE "CronJob" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "CronJob" ADD CONSTRAINT "CronJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CronJob_projectId_idx" ON "CronJob"("projectId");

ALTER TABLE "RunQueue" ADD COLUMN "projectId" INTEGER;
UPDATE "RunQueue" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;
ALTER TABLE "RunQueue" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "RunQueue" ADD CONSTRAINT "RunQueue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "RunQueue_projectId_idx" ON "RunQueue"("projectId");
