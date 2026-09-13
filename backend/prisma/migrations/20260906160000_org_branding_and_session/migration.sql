-- Login-screen branding and the org-wide session timeout.
ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Organization" ADD COLUMN "sessionMaxHours" INTEGER NOT NULL DEFAULT 24;
