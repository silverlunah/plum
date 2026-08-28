# rrweb Migration — Development Plan

> **Temporary planning document.** This is a working guide for the screenshot → rrweb
> migration, updated as each phase lands. **Delete this file in the final phase**
> (README/docs update), once the migration is complete and its content has been
> folded into the real docs.

## Goal

Replace screenshot-based test capture with [rrweb](https://github.com/rrweb-io/rrweb)
session recording (DOM snapshots + mutations), for both static reports and the live
run view. Screenshots are removed entirely — everything is stored in Postgres. This
also picks up two things the current system never supported: multiple browser tabs
opened during a single scenario, and multiple parallel workers running on one runner.

Explicitly out of scope: video recording and "take screenshot" buttons — separate
future task.

## Architecture decisions

| Decision                                 | Choice                                                                                                                                                                                                                                                                              | Why                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Recording storage                        | Postgres only, new `Recording` model, gzip-compressed events                                                                                                                                                                                                                        | User wants everything in the DB; S3 stays reserved for backup export only                                                                  |
| Recording granularity                    | One `Recording` row per (report, scenario, workerId, tabId)                                                                                                                                                                                                                         | Matches the new Runner → Worker → Tab hierarchy below                                                                                      |
| Multi-tab capture                        | New: listen for `context.on('page', ...)` in `browser.ts`                                                                                                                                                                                                                           | Today only one `Page` singleton is ever tracked — this doesn't exist yet                                                                   |
| Worker attribution                       | Read `CUCUMBER_WORKER_ID`/`CUCUMBER_TOTAL_WORKERS` (already injected by Cucumber's `child_process.fork`, currently unused anywhere in Plum); tag scenario via Cucumber's `attach()` → `step.embeddings`, the same pipeline screenshots already use to reach `processCucumberJson()` | Cucumber's own JSON formatter drops `workerId` before Plum ever sees it — this is the only way to recover it                               |
| `Report.runners` field conflation        | Fix now: split into explicit `runnerCount` (lane/machine count) and `workerCount` (intra-runner parallelism count)                                                                                                                                                                  | Currently the same DB column means "worker count" on the built-in path and "lane count" on the distributed path — same field, two meanings |
| Live streaming, remote runner nodes      | New scoped outbound Socket.IO channel: runner node → backend, opened per-job, authenticated with the existing runner credential (same one used for HTTP dispatch). HTTP control plane (`/api/execute`, `/api/ping`, `/api/shutdown`, `/api/restart`) is untouched.                  | Current 2.5s HTTP poll cadence is too coarse for rrweb event volume; user chose to invest in lower latency now rather than accept batching |
| Nested tab UI — static reports (Phase 2) | Runner tabs → Worker tabs (only when `workers > 1`); browser-tab level replaced by auto-switching (see Phase 2 notes) instead of a third tab strip                                                                                                                                  | User chose full tab-strip treatment for runner/worker; multi-tab-within-a-scenario turned out better served by auto-switching              |
| Nested tab UI — live view (Phase 3)      | Runner tabs → Worker tabs only, no browser-tab level                                                                                                                                                                                                                                | Scope cut — live view doesn't need per-browser-tab switching, just runner/worker                                                           |
| Element inspector                        | Static reports (Phase 2) only. Click-to-inspect overlay on the rrweb-player's reconstructed iframe DOM (real DOM nodes, so standard DOM APIs work); devtools-style code viewer for the selected element's markup                                                                    | Enabled naturally once real DOM (not screenshots) is captured. Live view scope cut — not needed there, just stream + logs + tabs           |
| Syntax highlighting for code viewer      | **Undecided** — hand-rolled vs. a small library (e.g. Prism core + HTML grammar). Revisit at Phase 2 kickoff.                                                                                                                                                                       | No highlighter exists in the repo today; this is a real new-dependency decision, not to be made silently                                   |
| Migration notice                         | One-time dismissible notice on existing reports once their screenshot refs are stripped, explaining only steps/logs remain                                                                                                                                                          | User requirement                                                                                                                           |
| Backup                                   | Reconsider including `Report`/`Recording` in `backupService.exportAll()` (currently excludes `Report` entirely, citing screenshot files as the reason) — likely opt-in given potential export size, now that there's no external file dependency                                    | User requirement — "should be easier now that we don't have to worry about screenshots"                                                    |

## Phases

Each phase is its own Vikunja ticket, branch, and PR.

- [x] **Phase 1 — Capture (backend/runner)** _(Vikunja #274, branch `274-rrweb-migration-phase-1-recording-capture-backend-runner`)_
  - [x] Multi-page tracking in `backend/tests/utils/browser.ts` — context-level `exposeBinding`/`addInitScript` (not per-page listeners) so recording setup can't race a new tab's first navigation; `context.on('page', ...)` only does tabId bookkeeping
  - [x] rrweb recorder (`@rrweb/record`'s UMD bundle) injected alongside the existing `screenshotStep()`/`streamLiveScreenshot()` calls — old screenshot capture is untouched until Phase 4, both run in parallel during the migration
  - [x] Worker-id tagging (`CUCUMBER_WORKER_ID`, 0-indexed → stored 1-based) bundled into each tab's gzip payload and flushed once per scenario via the `After` hook, reusing the existing `attach()` → `step.embeddings` → `processCucumberJson()` pipeline (same one screenshots already use)
  - [x] New `Recording` Prisma model (one row per report/scenario/worker/tab, gzip-compressed `events` bytes) + hand-written migration with backfill
  - [x] `Report.runners` → split into `runnerCount` + `workerCount` (schema + all call sites: `nodeExecutionService.js`, `triggerService.js`, `generate-report.js`, `socketHandler.js` ×2, `cronService.js` ×2, `reportService.js`). Migration backfills historical rows heuristically (comma-joined `runnerName` ⇒ old value was lane count; otherwise it was worker count) since the two were never distinguishable after the fact.
  - [x] `reportService.processCucumberJson()` now also returns `scenario.id` (Cucumber's own stable id, needed to join `Recording` rows back to scenarios) and a flat `recordings[]` array, persisted via `prisma.recording.createMany` after `Report.create()`
  - [x] **Remote runner nodes work by construction, no extra code**: `runnerService.collectTestFiles()` uploads the whole `backend/tests/` tree (including `browser.ts`/`hooks.ts`) fresh on every dispatch, so capture logic always matches the primary. The one operational requirement is that each node has `@rrweb/record` installed locally — covered by the existing `plum update` / `plum node restart` dependency-refresh flow, same as any other new backend dependency.
  - [x] Frontend display: split the single "N runners" stat in `reports/[id]/+page.svelte` into separate runner/worker stats (worker stat only shown when `workerCount > 1`)
  - [x] Verified end-to-end in the running Docker stack: migration applied cleanly with correct backfill, a real test run produced a real gzip-compressed rrweb event blob in a `Recording` row, and a `--parallel 2` run correctly tagged 7 scenarios across `workerId` 1/2 with no collisions. Verification reports/recordings cleaned up from the dev DB afterward (cascade delete confirmed working).
  - Known pre-existing, out-of-scope items noticed along the way (not touched): a `tsc --noEmit` type error on `this.attach.bind(this)` calls in `hooks.ts` (pre-dates this branch); `backend/tests/hooks.ts` has a `BeforeStep` logging hook that `backend/_scaffold/hooks.ts` lacks; local demo `.env` is missing `BASE_URL` so the scaffolded login scenarios fail on `page.goto` regardless of this migration.
  - Ready to open PR
- [x] **Phase 2 — Static report replay (frontend)** _(Vikunja #275, branch `275-rrweb-migration-phase-2-static-report-replay-frontend`, PR #96)_
  - [x] `rrweb-player` dependency + `RecordingPlayer.svelte` (later split into `StepsRail`, `MultiTabTimeline`, `ElementInspector`), replacing the screenshot-slider modal in `reports/[id]/+page.svelte`
  - [x] Reports page groups scenarios by Runner → Worker (single-worker/single-runner reports collapse to the old flat view; a full Browser-tab strip per the plan's nested-tab decision turned out unnecessary — multi-tab recordings auto-switch instead, see below)
  - [x] Multi-tab/window recordings auto-switch which tab is shown as playback crosses segment boundaries, computed from real Playwright open/close timestamps (`Recording.startedAt`/`endedAt`, new columns) — no manual tab-clicking; a small read-only badge shows which tab is active
  - [x] Element inspector overlay (click-to-inspect on the rrweb-player's reconstructed iframe DOM) + devtools-style markup code viewer (`CodeViewer.svelte`, hand-rolled regex highlighter — resolves the Phase 1 open question, no new dependency)
  - [x] Fixed a pre-existing bug found along the way: Cucumber's legacy JSON `id` is identical for every Scenario Outline Examples row, corrupting recording/retry attribution — now keyed on `id;;line`
  - [x] Step data tables (`dataTable`) now captured and rendered
  - Ready to open PR / PR open — see #96 for full detail and the multi-tab replay bugs fixed in the second commit
- [ ] **Phase 3 — Live view migration**
  - Scope cut from the original plan (user decision): **no element inspector in live view** — just the rrweb stream, run logs, and Runner → Worker tab navigation. No browser-tab-level strip, no inspect overlay/code viewer. Inspector stays a Phase 2 (static report replay) feature only.
  - Scoped runner→backend Socket.IO telemetry channel (see decision table)
  - New socket events for batched rrweb event streaming, mirrored in `backend/constants/socketEvents.js` and `frontend/src/lib/socketEvents.js`
  - `RunnerPanel.svelte` buffers events per (lane, worker) instead of `latestScreenshot`
  - Live page swaps the `<img>` panel for a live-mode `rrweb-player`, Runner → Worker tabs only (no Browser-tab level)
- [ ] **Phase 4 — Removal & cleanup**
  - Delete `screenshotStep()`, screenshot-file logic in `reportService.js`, `SCREENSHOTS_DIR`, the `/screenshots` static route, `screenshotUrl()`, dead copy/constants
  - Confirm and remove the vestigial unused `backend/playwright.config.js`
- [ ] **Phase 5 — Existing-report migration + notice**
  - Startup migration: strip `screenshot` refs from old `Report.content`, delete everything in `SCREENSHOTS_DIR`
  - One-time dismissible in-app notice explaining legacy reports now only contain steps/logs
- [ ] **Phase 6 — Backup revisit**
  - Reconsider including `Report`/`Recording` in `backupService.exportAll()`, likely behind an opt-in toggle
- [ ] **Phase 7 — Docs & cleanup (final)**
  - Update README and any other docs: remove screenshot explainers, add rrweb + element-inspector explainers
  - **Delete this file**

## ⚠️ `backend/tests/` is gitignored — edit `backend/_scaffold/` too

`backend/tests/` (`browser.ts`, `hooks.ts`, step definitions, features) is **entirely
gitignored** (`.gitignore:49`). It's a local, one-time copy made by
`bin/scaffold-tests.js` from the tracked template at `backend/_scaffold/`. Any change
to the capture/hook framework must be made in **both** places — `backend/tests/` to
keep the local working copy (and any local manual verification) functional, and
`backend/_scaffold/` because that's the actual file that ships in the repo/npm package
and gets copied into every fresh `tests/` directory. Confirmed by diffing the two
trees before editing — `_scaffold/` was in sync with `tests/`'s pre-migration state
except for one pre-existing, unrelated drift (a `BeforeStep` logging hook present in
`tests/hooks.ts` but not in `_scaffold/hooks.ts`) which was left alone as out of scope.

## Key file reference map

| Concern                                    | File(s)                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshot capture (to be replaced)        | `backend/tests/utils/browser.ts:38-63`, `backend/tests/utils/hooks.ts:34-38`                                                                              |
| Report JSON → DB transform                 | `backend/services/reportService.js` (`processCucumberJson`, `saveReport`, `saveCombinedReport`)                                                           |
| Report Prisma model                        | `backend/prisma/schema.prisma:55-80`                                                                                                                      |
| Screenshot serving/cleanup                 | `backend/app.js:20`, `reportService.js:108-118,190-197`                                                                                                   |
| Live screenshot transport                  | `backend/lib/screenshotPoller.js`, `backend/websockets/socketHandler.js`, `backend/services/nodeExecutionService.js`, `backend/services/runnerService.js` |
| Live view frontend                         | `frontend/src/routes/reports/live/+page.svelte`, `frontend/src/lib/components/layout/RunnerPanel.svelte`, `frontend/src/lib/stores/runner.js`             |
| Static report frontend                     | `frontend/src/routes/reports/[id]/+page.svelte` (fake screenshot-slider "Replay" to be replaced)                                                          |
| Backup                                     | `backend/services/backupService.js`                                                                                                                       |
| Runner node control (HTTP-only, untouched) | `backend/routes/node.routes.js`, `backend/services/nodeExecutionService.js`                                                                               |

## Open questions log

- Element-inspector syntax highlighting dependency — decide at Phase 2 kickoff.
