-- Global admins reach every project implicitly (accessibleProjectIds), so an
-- admin ProjectMember row is redundant and skews member counts. Drop them.
DELETE FROM "ProjectMember"
WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'admin');

-- On a fresh DB the seeded project (id 1) was removed by the previous migration,
-- leaving the id sequence past 1. Reset it so the wizard's first project is id 1
-- and every project — the first included — lives in projects/<id>/.
SELECT setval('"Project_id_seq"', 1, false) WHERE NOT EXISTS (SELECT 1 FROM "Project");
