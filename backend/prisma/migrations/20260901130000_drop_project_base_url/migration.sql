-- Project.baseUrl was never read at run time — the per-project target is
-- BASE_URL in projects/<slug>/tests/.env, and CI/MCP pass their own override.
ALTER TABLE "Project" DROP COLUMN "baseUrl";
