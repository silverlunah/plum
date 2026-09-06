-- Sign-in methods: password (on by default) and Google (off until configured).
ALTER TABLE "Organization" ADD COLUMN "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "googleLoginEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "googleClientId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Organization" ADD COLUMN "googleClientSecret" TEXT NOT NULL DEFAULT '';

ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
