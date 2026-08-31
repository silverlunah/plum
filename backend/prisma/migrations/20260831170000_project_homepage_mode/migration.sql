-- AlterTable
ALTER TABLE "Project" ADD COLUMN "defaultHome" TEXT NOT NULL DEFAULT 'automated';
ALTER TABLE "Project" ADD COLUMN "manualRepositoryOnly" BOOLEAN NOT NULL DEFAULT false;
