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
| Backup                                   | `Report`/`Recording` now included in `backupService.exportAll()`, behind an opt-in `Project.backupIncludeReports` toggle (default off) — governs both manual export and scheduled S3 backups                                                                                        | User requirement — "should be easier now that we don't have to worry about screenshots"; opt-in since recordings can make backups large    |

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
- [x] **Phase 3 — Live view migration** _(branch `276-rrweb-migration-phase-3-live-view-migration`, PR #97)_
  - Scope cut from the original plan (user decision): **no element inspector in live view** — just the rrweb stream, run logs, and Runner → Worker tab navigation. No browser-tab-level strip, no inspect overlay/code viewer. Inspector stays a Phase 2 (static report replay) feature only.
  - Scoped runner→backend Socket.IO telemetry channel: new `/node-stream` namespace (`nodeSocketHandler.js`), token-authed with the existing runner credential; `nodeStreamRegistry.js` relays batches keyed by jobId. Built-in runner reuses the existing local 500ms file-poller instead (no socket hop needed in-process); both paths converge on the same `RUNNER_LANE_RRWEB_BATCH`/`BG_RUN_LANE_RRWEB_BATCH` socket events to the browser
  - A node learns the primary's own reachable URL by reusing the existing `notifyPublicUrl` Settings field (webhooks) rather than adding a new one — same intent, no schema change
  - New socket events for batched rrweb event streaming, mirrored in `backend/constants/socketEvents.js` and `frontend/src/lib/socketEvents.js`
  - `RunnerPanel.svelte`/`runner.js` store buffer events per (lane, worker) in `rrwebByLane` instead of `latestScreenshot`
  - New `LiveReplayer.svelte` — `rrweb-player` in live mode (`liveMode: true`, `player.addEvent()` as batches arrive), rendered at the recording's native resolution and scaled via `ResizeObserver` to fully cover its panel (no letterboxing)
  - Live page redesigned to full-bleed fullscreen (breaks out of the centered `PageShell`), stream + slim log sidebar filling the whole viewport, Runner → Worker tabs only (no Browser-tab level)
  - Verified end-to-end for the **built-in runner** (single and multi-worker) via direct DOM measurement of the cover-scale across a full run, not just screenshots
  - **Not yet verified**: the remote/external runner node path (needs `notifyPublicUrl` configured + a running node process) — backend code is written and syntax/svelte-checked only
  - Found and fixed along the way: a fast-failing test can finish before the 500ms poll flush ever fires, so very short runs may show no live frames at all — inherent to the poll-based transport, not a regression, not chased further this phase
- [x] **Phase 4 — Removal & cleanup** _(branch `277-rrweb-migration-phase-4-removal-cleanup`)_
  - Deleted `screenshotStep()`, `streamLiveScreenshot()`, and the screenshot-on-failure block in `teardown()` from `backend/_scaffold/utils/browser.ts` (+ synced to the gitignored `backend/tests/` working copy); `AfterStep` hook in `hooks.ts` removed entirely since nothing else was left in it
  - Deleted screenshot extraction/write logic from `reportService.processCucumberJson()`, `collectScreenshotFiles()`/`deleteScreenshotFiles()`, `SCREENSHOTS_DIR` (`reportFilename.js` + `app.js`'s `/screenshots` static route), `screenshotUrl()` (frontend), the screenshot rendering block + `SCREENSHOT_TOGGLE_LABEL`/`STEP_SCREENSHOT_ALT`/`NO_SCREENSHOT_MESSAGE` copy in `reports/[id]/+page.svelte`, `scenarioHasScreenshots()` (dead, zero call sites), and the `get_report_screenshot` MCP tool
  - Deleted the four screenshot socket events (`STEP_SCREENSHOT`, `RUNNER_LANE_SCREENSHOT`, `BG_RUN_SCREENSHOT`, `BG_RUN_LANE_SCREENSHOT`) and all their emit/listen call sites and `latestScreenshot` state, across `socketHandler.js`, `triggerService.js`, `cronService.js`, `runnerService.dispatchAndPoll()`, `nodeExecutionService.js`, and `RunnerPanel.svelte`
  - `backend/lib/screenshotPoller.js` → renamed to `rrwebPoller.js` (`startSsPoller` → `startRRwebPoller`) now that it's 100% rrweb — it was already shared/dual-purpose going into this phase, screenshots were just the half being cut
  - Confirmed and removed the vestigial unused `backend/playwright.config.js`
  - Also cleaned up along the way (found via full-repo sweep, same spirit even if not explicitly listed): dead `LIVE_STEP_LABEL`/`LIVE_BROWSER_VIEW_ALT` copy, and renamed the live page's leftover `.screenshot-panel` class (now 100% rrweb) to `.stream-panel`
  - Verified: backend `node --check` clean on every edited file, `svelte-check` 0 errors, Docker rebuild clean startup, a real live run end-to-end (stream + logs + report save) still works with no console errors
  - Old reports with a `screenshot` filename still in their stored `content` JSON degrade gracefully (field just goes unused, no crash) — actually stripping those refs is Phase 5's job, not this one's
- [x] **Phase 5 — Existing-report migration + notice** _(branch `278-rrweb-migration-phase-5-existing-report-migration-notice`)_
  - Hand-written Prisma migration (`20260828150000_strip_screenshot_refs_from_reports`) walks every `Report.content.features[].scenarios[].steps[]` in Postgres via nested `jsonb_agg`/`jsonb_set`/`step - 'screenshot'` and strips the `screenshot` key in place — steps/logs/everything else untouched. Dry-run tested with a `SELECT` against real data before writing it as a migration.
  - `serverBootstrap.js`'s `handleFullModeStartup()` deletes the old `reports/screenshots/` directory on every boot (naturally idempotent — a no-op once it's already gone, no flag needed)
  - One-time dismissible notice banner on the reports list (`LEGACY_SCREENSHOTS_NOTICE`), dismissal persisted via `localStorage` the same way `RunnerPanel.svelte` already does for its own UI state
  - Verified against real dev data: 55 reports, 53 had a `screenshot` key somewhere — all 53 stripped cleanly (confirmed via direct SQL query post-migration), the 2,449-file `reports/screenshots/` dir was actually deleted on boot, and both old and new report detail pages render with no console errors
- [x] **Phase 6 — Backup revisit** _(branch `280-rrweb-migration-phase-6-backup-revisit`)_
  - New `Project.backupIncludeReports` field (migration `20260828160000_add_backup_include_reports`, defaults off), one toggle in Settings → Backup that governs both manual export and scheduled S3 backups
  - `exportAll(includeReports)` — when on, also exports every `Report` with its `Recording[]`; gzip-compressed `events` BYTEA is base64-encoded for JSON transport, `startedAt`/`endedAt` (BigInt) stringified since `JSON.stringify` can't serialize BigInt natively
  - `importAll()` restores reports (upsert by id) + recordings (delete-and-recreate per report, same pattern as test steps). `cronJobId` is deliberately **not** trusted from the export — cron jobs are upserted keyed on `taskName`, not `id`, so a report's recorded `cronJobId` may not point at the right row after a restore; re-resolved instead via `triggerType` → cron job `taskName`, the same lookup `reportService.resolveCronJobId()` already does when a report is first created
  - Export `version` bumped to `'3'`; the backup's own `disclaimer` field is now dynamic based on whether reports were included
  - Verified end-to-end against real dev data (55 reports, 221 recordings): toggled on, exported, fed the export back through `/backup/import`, confirmed report/recording counts unchanged and a recording's raw gzip bytes byte-for-byte identical via SHA-256 checksum before and after the round-trip; report detail pages still render correctly post-restore
- [x] **Phase 7 — Docs & cleanup (final)** _(no branch — this phase only touched external docs, no repo code)_
  - Root `README.md` and `frontend/README.md`/`backend/README.md` never mentioned screenshots — nothing to change there. The real user-facing docs live on the team's Outline wiki (linked from the README's docs badge), not in this repo.
  - Updated 4 Outline docs that described the old screenshot behavior, replacing each with the rrweb equivalent: **Running Tests Locally** (2 mentions — "what happens when you run tests" step list, and the "check the screenshot on failure" tip → now describes the session recording + Replay), **Writing Tests** (2 mentions — `browser.ts`/`hooks.ts` lifecycle descriptions), **Setting Up the Server** (1 mention — the Caddy/WebSocket note, screenshot streaming → live session-recording stream), **Initializing the Project** (1 mention — the generated directory tree's inline comment for `browser.ts`)
  - Each doc was fetched as ProseMirror JSON, converted to Markdown with a purpose-built converter (correcting a mark-ordering bug along the way — ProseMirror's `marks` array order isn't a consistent nesting order across text runs, which naively produced doubled `**` sequences), edited, and pushed back — verified formatting-faithful (tables, code blocks with language tags, links, blockquotes) before and after
  - **`RRWEB_MIGRATION_PLAN.md` itself is intentionally not deleted yet** — the plan's own instruction says to delete it here, but all 7 phases are still a stack of unmerged PRs (#96-#101, plus this phase's doc-only changes with no PR). Deleting the one document tracking that whole stack before any of it lands seems like the wrong tradeoff; leaving this decision for the user to make once the stack actually merges.

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
