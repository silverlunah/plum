-- AlterTable
ALTER TABLE "AiSession" ADD COLUMN     "providerSessionId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transcript" JSONB NOT NULL DEFAULT '[]';
