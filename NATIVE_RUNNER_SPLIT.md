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
- **Cucumber's native `--retry` works but its legacy JSON reports only the final
  attempt.** Measured: `--retry 3` on a always-failing scenario ran 4 attempts, and the
  JSON held exactly one entry. So Plum cannot read attempts/flakiness from it, and must
  keep re-running failures itself for Cucumber. Playwright's JSON does report every
  attempt in `results[]`, so it uses native `--retries`. Both still take their count
  from the project's max-retries setting; only the mechanism differs.
- CLI flags override config on both: Playwright `--retries=3` beat `retries: 1`, and
  Cucumber `--retry 3` beat `retry: 1`.
- **Shell metacharacters must be quoted.** A tag expression becomes `--grep
"@a|@b"`; unquoted, the `|` is a shell pipe and the spawn dies with exit 127.
  `shell: true` is not optional (npm/npx need it on Windows), so the builder quotes.

## Finding: projects already resolve the shared node_modules

`npx playwright test` run inside `projects/<slug>/tests/` resolves `@playwright/test`,
`dotenv` and everything else by walking **up** the tree to the backend's
`node_modules` — verified on the host, and the container layout is identical
(`WORKDIR /app`, projects bind-mounted at `/app/projects`, modules at
`/app/node_modules`). Six specs listed with no `NODE_PATH` and no local
`node_modules`.

So "projects become npm packages" as originally planned — a `package.json` and a full
`npm install` per project — would duplicate ~300MB per project and buy nothing for
either server runs or a developer running the CLI by hand inside the install tree.
`NODE_PATH` is only needed where a run executes **outside** the tree, i.e. a dispatched
node's temp dir, and that use is legitimate and can stay.

What genuinely remains is `plum.plugins.json`, which installs a project's extra
dependencies into the **backend's own** `package.json`: one project's dependency is
installed for every project, and it mutates a file that Plum upgrades replace.
Recommended replacement: a per-project `package.json` that is installed **only when it
declares dependencies**. Projects needing nothing get no `node_modules` and resolve
upward as they do now; a project needing `@faker-js/faker` gets a local `node_modules`
holding just that, and Node's resolution handles the mix (local first, then up).

Estimate effect: Phase 1b drops from ~3d to ~1d, and the risk "nodes have no
per-project deps" mostly evaporates — nodes keep using `NODE_PATH`.

## Two caveats from Phase 1b

- **`PROJECTS_DIR` outside the backend tree breaks upward resolution.** It is an env
  override (`lib/projectPaths.js`) that nothing sets in practice — Docker mounts to
  `/app/projects`, inside `/app` — but an operator who points it elsewhere would get
  "Cannot find module '@playwright/test'". Either document it as must-be-inside, or
  fall back to `NODE_PATH` when it is not.
- **Dispatched node runs do not get project dependencies.** `ensureProjectDeps` works
  from `projectId` → `resolveTestsRoot`, which on a node is not the temp dir the
  uploaded tests land in. Phase 3 owns this: the node needs to install from the
  `package.json` that arrives with the payload.

## Hazards

1. **Migration default must not reach existing rows.** _Deferred, not solved._ The
   Phase 0 migration adds the column with default `'cucumber'`, so existing rows are
   correct by construction — verified against a real Postgres: pre-existing Project
   and Report rows both read `cucumber` afterwards. The hazard moves to **Phase 7**,
   where flipping the default must be `ALTER COLUMN ... SET DEFAULT` alone. Never
   fold that into an `ADD COLUMN`.
2. ~~**`reconcile()`** re-scaffolds any project missing `tests/features`.~~ **Fixed in
   Phase 0** — it reads `Project.framework` and skips non-Cucumber projects.
   Verified: deleting a Cucumber project's folder makes `reconcile()` restore it,
   while a Playwright project is left alone.
3. **Nodes have no per-project deps.** Dispatched runs borrow the backend's
   `node_modules` today. Per-project installs need an install step + cache in the
   dispatch path (`runnerProcess.js:174`).
4. **Shards assume identical file sets** across nodes — a stale upload makes shard
   indices diverge silently. Needs a manifest hash check before dispatch.
5. **Cucumber `--retry` attempts in the legacy `json` formatter are unverified.**
   Confirm before deleting Plum's re-spawn loop for Cucumber mode.

## Phases

- [x] **A. Framework prompt in `plum server` config flow**
      Asked first, before the existing mode/ports/URL questions. Stored in
      `.plum-server.json` as the default framework for projects created on this server.
- [x] **0. `Project.framework`, immutable** — done. Swapped ahead of the npm-package
      phase: framework-aware scaffolding cannot exist before the column does.
      `framework String @default("cucumber")` on Project and Report (a String, not an
      enum — the schema has no enums and every status-like column is a lowercase
      String). `reconcile()` now reads the column instead of sniffing for `features/`.
      Create form has a framework picker, pre-selecting `FRAMEWORKS[0]` (playwright)
      — the same single source of truth the CLI uses, so the offered default cannot
      drift between UI and CLI.
- [x] **1a. Split the scaffold** — done. `_scaffold/{cucumber,playwright}/`.
      Playwright projects get `playwright.config.ts` + `specs/` + `pages/`; the config
      lives at the root of the tests folder (not the project folder) because that is
      what a run executes from and what `testsPath` can relocate. `reconcile()` uses a
      per-framework sentinel file (`features` / `playwright.config.ts`) so it is
      idempotent for both. `plum project init` takes `--framework`.
- [x] **1b. Per-project dependencies** — done, rescoped per the finding below.
      Each scaffold ships a `package.json`; `lib/projectDeps.js` runs `npm install` in
      the tests folder **only when it declares dependencies**, keyed on a hash marker
      inside `node_modules` so an unchanged manifest never reinstalls. Called from the
      built-in runner before a spawn. `plum.plugins.json` and its three functions
      (scaffold / install-into-backend / merge-into-backend) are gone.
      Verified: no deps = no install; a declared dep lands in the project's own
      `node_modules`; unchanged deps skip; changed deps reinstall; and
      `@playwright/test` still resolves from the backend while the project's own
      dependency resolves locally.
- [x] **2. Plum reporter — done WITHOUT the two packages.** The reporter is a
      conditional entry in the project's own config, not an npm package: both scaffolds
      add a JSON reporter only when `PLUM_REPORT_FILE` is set, so a Plum-started run
      reports and a hand-run does not. Plum still passes no `--reporter` flag (which
      would replace the config's whole list rather than add to it).
      Also added the project-owned `cucumber.js` the Cucumber scaffold was missing —
      `npx cucumber-js` with **no arguments** now works from a project folder, which is
      the point of the exercise. Verified both frameworks, with and without the env var.
      Dropped from ~4d to ~0.5d. A real package is only needed to POST results from CI
      or a hand-run; revisit then, and note that a config copied into a project does
      not receive later updates the way a versioned package would.
- [x] **3. Native spawn, wrapper retired** — DONE. `lib/runnerCommand.js`
      builds the native invocation for both frameworks; scaffold configs set retries to
      0 so Plum's count is the only one. Verified end to end: `playwright test --grep
  "@TC-001|@TC-003" --project=chromium --retries=2` selected exactly two tests, ran
      one browser, recorded 3 attempts on the failure and wrote the report to
      PLUM_REPORT_FILE. Remaining: swap the four spawn sites, delete the alias.
- [ ] **3 (original scope)** — per-framework command builder replacing
      `run-tests.js`. Four spawn sites: `runExecutorService.js:144`,
      `nodeExecutionService.js:96`, `bin/plum.js:1465`, `backend/package.json:9`.
      Delete the `plum run-test` command + its docs.
- [x] **4. Ingestion + discovery** — DONE for the built-in and node paths. — `processPlaywrightJson()` producing the stored
      `{features, recordings, status, flakyCount}` shape — implemented as
      `lib/playwrightReport.js` adapting to the _existing_ shape rather than a second
      pipeline, so the retry merge, tag sync, report page and exporters are untouched.
      Playwright discovery via `--list` in `lib/playwrightDiscovery.js`.
      Kept `testService.js`'s parser for Cucumber as planned.
      NOT done: exportService / testImportService / MCP tools are still
      Gherkin-shaped and unreviewed for Playwright projects.
- [~] **5. Frontend** — partly done. Framework picker with logos on project create,
  framework badge per project row, read-only framework field in project settings,
  "Powered by" replacing "Learn more", Cucumber links hidden in Playwright
  projects, and Gherkin keywords dropped from Playwright reports.
  NOT done: the repository page still speaks in Cucumber terms; create-test /
  create-step generators are Gherkin-only and not gated by framework.
- [ ] **6. rrweb fixture + live streaming** for Playwright (pairs with the work on
      `fix-live-rrweb-streaming-and-inspect-hardening`).
- [ ] **7. Flip the default to Playwright** — last, so new projects never land in a
      mode whose ingestion and report UI are unfinished.

## Decisions still needed

**Two browser projects = double runs.** The Playwright scaffold defines both chromium
and firefox, which is idiomatic — but `--list` shows every spec twice, once per
project, so a bare `npx playwright test` runs everything in both browsers. Phase 3 has
to pass `--project=<browser>` for Plum's browser picker, since `Report.browser` is a
single column. Decide there whether Plum ever allows a multi-browser run.

**Positioning.** Is Cucumber "the other supported framework" or "legacy, kept
working"? Changes the README and create-flow copy, and whether the Cucumber path gets
further investment after this.
