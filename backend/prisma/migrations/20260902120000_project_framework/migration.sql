-- Per-project test framework, fixed at creation. "cucumber" or "playwright".
--
-- The default is deliberately "cucumber" so this migration is a no-op for every
-- project that already exists: they are all Cucumber projects, and adding the
-- column with that default is what makes them stay that way.
--
-- New projects will default to "playwright" only once the Playwright ingestion
-- and report UI are complete. That change is an ALTER COLUMN SET DEFAULT and
-- must never be folded into an ADD COLUMN — doing both at once would rewrite
-- every existing row to "playwright".
ALTER TABLE "Project" ADD COLUMN "framework" TEXT NOT NULL DEFAULT 'cucumber';

-- Denormalised onto the report so the renderer can pick a parser without a join.
ALTER TABLE "Report" ADD COLUMN "framework" TEXT NOT NULL DEFAULT 'cucumber';
