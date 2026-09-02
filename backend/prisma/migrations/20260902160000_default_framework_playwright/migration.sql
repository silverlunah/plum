-- New projects default to Playwright.
--
-- SET DEFAULT only. It changes what a future INSERT gets and rewrites nothing, so
-- every existing project keeps the framework it was created with. Folding this
-- into the ADD COLUMN that introduced the column would have converted every
-- Cucumber project in place — which is why it was deliberately left until the
-- Playwright runner, ingestion, report UI and replay were all finished.
ALTER TABLE "Project" ALTER COLUMN "framework" SET DEFAULT 'playwright';

-- Report.framework keeps its 'cucumber' default on purpose. saveReport always
-- writes it explicitly from the project, so the default only ever applies to rows
-- that predate the column — and those are all Cucumber.
