-- Roles become owner > admin > user. The account's first user is the owner
-- (every project, every setting). Any other admins keep their access to only
-- the projects they're assigned to.
UPDATE "User" SET "role" = 'owner'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  AND "role" = 'admin';
