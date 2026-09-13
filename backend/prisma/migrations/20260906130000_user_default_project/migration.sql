-- Which project a user lands on right after login. Nullable, cleared (not
-- blocked) if that project is later deleted, since a personal preference
-- shouldn't hold a project hostage.
ALTER TABLE "User" ADD COLUMN "defaultProjectId" INTEGER;

ALTER TABLE "User" ADD CONSTRAINT "User_defaultProjectId_fkey"
  FOREIGN KEY ("defaultProjectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
