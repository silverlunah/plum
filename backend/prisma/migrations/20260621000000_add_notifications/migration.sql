-- AlterTable Project: add webhook and public URL fields
ALTER TABLE "Project" ADD COLUMN "discordWebhookUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "slackWebhookUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "notifyPublicUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable CronJob: add notification toggles
ALTER TABLE "CronJob" ADD COLUMN "notifyDiscord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CronJob" ADD COLUMN "notifySlack" BOOLEAN NOT NULL DEFAULT false;
