# Native Runner Split — working notes

Temporary tracker. **Delete this file when the project is done.**

Branch: `playwright-or-cucumber-framework-choice` (base: `master` @ 6d3e5d5)

## Goal

Each project picks Playwright or Cucumber once, at creation, and can never change.
Plum stops wrapping the runners: the project's own `playwright.config.ts` /
`cucumber.js` owns browser, workers, retries, reporters and timeouts, and Plum passes
only test selection plus a report destination. `plum run-test` goes away; users run
`npx playwright test` / `npx cucumber-js` directly.

## Decisions (locked)

| Question                     | Answer                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Who owns run config?         | The project's own config file. Plum passes selection + report path only.                            |
| `plum run-test`?             | Deleted entirely.                                                                                   |
| Split across nodes?          | Native `--shard=k/N` for Playwright. Cucumber has no `--shard`, so `testChunker.js` survives there. |
| Default for **new** projects | `playwright`                                                                                        |
| Existing projects            | backfilled to `cucumber` — never touched by the new default                                         |

## Verified facts (Cucumber 11.2, Playwright 1.50.1, probed against this repo)

- Playwright CLI `--reporter=json` **replaces** the config's reporter list (kills the
  project's own html/trace reporters) and writes to **stdout** unless
  `PLAYWRIGHT_JSON_OUTPUT_NAME` is set. So Plum must pass **no** reporter flag — the
  project's config registers a Plum reporter instead.
- `playwright test --list --reporter=json` → nested suites → specs, with `tags`
  inherited from `describe`. Tags arrive **without** the `@` (`["TC-001"]`).
- Playwright result JSON: `results[]` = retries (native), `test.status === 'flaky'`,
  `results[].workerIndex`. Steps only exist if the author calls `test.step()`.
- `cucumber-js --dry-run --format json` emits the **same shape as a real run** —
  suite tags, scenario tags, Background steps inlined, data tables — no browser
  launched. But it **expands Scenario Outlines** (3 Examples rows → 3 scenarios),
  where `testService.js` yields 1 outline + an examples table.
- Cucumber has `--retry`, `--retry-tag-filter`, `--parallel`. No `--shard`.

## Hazards

1. **Migration default must not reach existing rows.** Adding `framework` non-null
   with `@default(PLAYWRIGHT)` converts every existing Cucumber project in place.
   Three ordered steps: add nullable column → `UPDATE ... SET 'CUCUMBER'` →
   set NOT NULL + default `'PLAYWRIGHT'`.
2. **`reconcile()` (`projectPaths.js:70`)** re-scaffolds any project missing
   `tests/features` on every server start. A Playwright project has none, so it would
   get Cucumber files written into it forever. Must read `Project.framework`, not
   sniff the filesystem.
3. **Nodes have no per-project deps.** Dispatched runs borrow the backend's
   `node_modules` today. Per-project installs need an install step + cache in the
   dispatch path (`runnerProcess.js:174`).
4. **Shards assume identical file sets** across nodes — a stale upload makes shard
   indices diverge silently. Needs a manifest hash check before dispatch.
5. **Cucumber `--retry` attempts in the legacy `json` formatter are unverified.**
   Confirm before deleting Plum's re-spawn loop for Cucumber mode.

## Phases

- [x] **A. Framework prompt in `plum server` config flow** ← current
      Asked first, before the existing mode/ports/URL questions. Stored in
      `.plum-server.json` as the default framework for projects created on this server.
- [ ] **0. Projects become npm packages** (blocks everything)
      Per-project `package.json` + install; framework-aware `scaffoldProject()` and
      `reconcile()`; retire `plum.plugins.json` and the `NODE_PATH` injection.
- [ ] **1. `Project.framework`, immutable** — 3-step migration; reject `framework` in
      every update path; create-flow selector (still defaults `CUCUMBER` until Phase 7);
      `Report.framework` denormalized.
- [ ] **2. Reporter packages** — `@plum-e2e/playwright-reporter`,
      `@plum-e2e/cucumber-formatter`. File mode (`PLUM_REPORT_FILE`) + authenticated
      HTTP mode (`PLUM_API_URL` + `PLUM_TOKEN`). No-op when neither is set.
- [ ] **3. Native spawn, wrapper retired** — per-framework command builder replacing
      `run-tests.js`. Four spawn sites: `runExecutorService.js:144`,
      `nodeExecutionService.js:96`, `bin/plum.js:1465`, `backend/package.json:9`.
      Delete the `plum run-test` command + its docs.
- [ ] **4. Ingestion + discovery** — `processPlaywrightJson()` producing the stored
      `{features, recordings, status, flakyCount}` shape; Playwright discovery via
      `--list`. **Keep** `testService.js`'s parser for Cucumber (avoids a user-visible
      outline regression on the now-legacy path).
- [ ] **5. Frontend** — step-less spec rendering, per-framework terminology, hide
      Gherkin-only affordances in Playwright projects.
- [ ] **6. rrweb fixture + live streaming** for Playwright (pairs with the work on
      `fix-live-rrweb-streaming-and-inspect-hardening`).
- [ ] **7. Flip the default to Playwright** — last, so new projects never land in a
      mode whose ingestion and report UI are unfinished.

## Open question

Is Cucumber positioned as "the other supported framework" or "legacy, kept working"?
Changes the README and create-flow copy, and whether the Cucumber path gets further
investment after this.
