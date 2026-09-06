-- "Default" was a placeholder a backup restore used to set as the org name; it
-- then showed as the heading on the login screen. Treat it as unconfigured.
UPDATE "Organization" SET "name" = '' WHERE "name" = 'Default';
