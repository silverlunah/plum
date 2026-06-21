-- AlterTable Project: add S3 backup configuration fields
ALTER TABLE "Project" ADD COLUMN "backupEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "backupCron"       TEXT    NOT NULL DEFAULT '0 2 * * *';
ALTER TABLE "Project" ADD COLUMN "backupS3Endpoint" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "backupS3Region"   TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "backupS3Bucket"   TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "backupS3AccessKey" TEXT   NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "backupS3SecretKey" TEXT   NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "backupS3Prefix"   TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "backupLastRunAt"  TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "backupLastStatus" TEXT    NOT NULL DEFAULT '';
