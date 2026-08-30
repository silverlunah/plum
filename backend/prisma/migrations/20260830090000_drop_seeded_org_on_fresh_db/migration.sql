-- 20260830060000 unconditionally seeded a "Default" org + project. On a genuine
-- fresh install (no users) that made needsSetup() false and locked you out of
-- the first-boot wizard. Remove the seed when there's nothing to migrate; the
-- cascade takes the project with it.
DELETE FROM "Organization" WHERE NOT EXISTS (SELECT 1 FROM "User");
