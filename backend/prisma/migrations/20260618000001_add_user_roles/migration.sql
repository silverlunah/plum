-- AlterTable User: add role column, promote first user to admin
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
UPDATE "User" SET "role" = 'admin' WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
