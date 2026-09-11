-- AlterTable
ALTER TABLE "RunQueue" ADD COLUMN     "envOverrides" JSONB NOT NULL DEFAULT '{}';
