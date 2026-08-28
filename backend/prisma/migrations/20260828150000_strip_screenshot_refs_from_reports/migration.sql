-- One-time data cleanup: screenshot capture was removed in favor of rrweb
-- session recording (see RRWEB_MIGRATION_PLAN.md Phase 4). Historical reports
-- still carry a `screenshot` filename on each step in the content JSONB —
-- strip it so old reports stop referencing files that no longer exist on
-- disk (deleted once, at startup, by serverBootstrap.js). Steps/logs are
-- otherwise untouched.
UPDATE "Report"
SET content = jsonb_set(
  content,
  '{features}',
  COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(feature->'scenarios') = 'array' THEN
          jsonb_set(feature, '{scenarios}', (
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(scenario->'steps') = 'array' THEN
                  jsonb_set(scenario, '{steps}', (
                    SELECT jsonb_agg(step - 'screenshot')
                    FROM jsonb_array_elements(scenario->'steps') AS step
                  ))
                ELSE scenario
              END
            )
            FROM jsonb_array_elements(feature->'scenarios') AS scenario
          ))
        ELSE feature
      END
    )
    FROM jsonb_array_elements(content->'features') AS feature
  ), content->'features')
)
WHERE jsonb_typeof(content->'features') = 'array';
