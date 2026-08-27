-- AlterTable: epoch-ms boundaries of each tab recording, so the replay UI can
-- line multiple tabs up on one absolute timeline and auto-switch between them.
-- Nullable — existing recordings predate this field and have no boundary data.
ALTER TABLE "Recording" ADD COLUMN "startedAt" BIGINT;
ALTER TABLE "Recording" ADD COLUMN "endedAt" BIGINT;
