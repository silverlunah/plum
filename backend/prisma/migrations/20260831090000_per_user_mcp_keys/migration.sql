-- MCP keys become per (project, member). The old single Project.mcpKey is
-- dropped — existing integrations mint a new personal key.

CREATE TABLE "McpKey" (
  "id"        TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "userId"    TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpKey_key_key" ON "McpKey"("key");
CREATE UNIQUE INDEX "McpKey_projectId_userId_key" ON "McpKey"("projectId", "userId");
CREATE INDEX "McpKey_userId_idx" ON "McpKey"("userId");

ALTER TABLE "McpKey"
  ADD CONSTRAINT "McpKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "McpKey_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" DROP COLUMN "mcpKey";

-- Attribution: mark what MCP created / triggered.
ALTER TABLE "TestSuite" ADD COLUMN "viaMcp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TestCase"  ADD COLUMN "viaMcp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Report"    ADD COLUMN "viaMcp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Report"    ADD COLUMN "startedBy" TEXT;
