-- The initial multi-project migration seeded the default project with an empty
-- name; give it a display name so the project switcher isn't blank.
UPDATE "Project" SET "name" = initcap("slug") WHERE "name" = '';
