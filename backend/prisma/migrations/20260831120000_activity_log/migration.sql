-- Append-only audit trail. Project-scoped rows are visible to that project's
-- admins; org-scoped rows to the owner only. Old rows are pruned nightly per
-- Organization.activityRetentionDays.

ALTER TABLE "Organization" ADD COLUMN "activityRetentionDays" INTEGER NOT NULL DEFAULT 90;

CREATE TABLE "ActivityLog" (
  "id"          TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scope"       TEXT NOT NULL DEFAULT 'project',
  "projectId"   INTEGER,
  "actorId"     TEXT,
  "actorLabel"  TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "targetType"  TEXT NOT NULL DEFAULT '',
  "targetId"    TEXT NOT NULL DEFAULT '',
  "targetLabel" TEXT NOT NULL DEFAULT '',
  "metadata"    JSONB,
  "source"      TEXT NOT NULL DEFAULT 'ui',
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_scope_createdAt_idx" ON "ActivityLog"("scope", "createdAt");
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt");
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");

ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivityLog_actorId_fkey"   FOREIGN KEY ("actorId")   REFERENCES "User"("id")    ON DELETE SET NULL ON UPDATE CASCADE;
