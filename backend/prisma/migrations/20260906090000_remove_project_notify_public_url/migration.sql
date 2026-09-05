-- notifyPublicUrl duplicated a URL `plum server start` already collects (uiUrl,
-- saved to .plum-server.json). It's now wired through as PLUM_PUBLIC_URL on the
-- backend container instead, instance-wide rather than re-entered per project.
ALTER TABLE "Project" DROP COLUMN "notifyPublicUrl";
