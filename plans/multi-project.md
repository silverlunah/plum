# Multi-project support — implementation plan

Vikunja: #299. Turns Plum from single-tenant into multi-project: one organization,
many projects, per-project access, fully isolated automated tests.

---

## Decisions (locked)

| Area                    | Decision                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated tests         | Every project is its own directory with the **entire** scaffold (`features/`, `step_definitions/`, `pages/`, `utils/browser.ts`, `utils/hooks.ts`, `.env`, `package.json`, `cucumber.json`). Nothing shared — Cucumber has no step namespacing. |
| Directory sync          | Plum stays out of git. A project points at a bind-mounted host folder; the operator keeps it current (n8n `git pull`, NFS, rsync). No repo URL, no token, no clone/pull, no webhook.                                                            |
| Org                     | One org. Modeled as a table; no multi-org UI.                                                                                                                                                                                                   |
| Roles                   | Global `admin` → all projects. `member` → assigned projects only. No viewer role.                                                                                                                                                               |
| Notifications           | Per-project (Discord/Slack).                                                                                                                                                                                                                    |
| DB backup               | Instance-level (one database).                                                                                                                                                                                                                  |
| Per-project env         | `.env` file in the project directory. Read at run time, injected into the Cucumber process env — `.env` edits are live, no restart.                                                                                                             |
| Toolchain               | `cucumber` / `playwright` / `ts-node` pinned centrally (shared `node_modules`). Project folders carry test code + `.env` only. A new npm import in a step file is the only case needing `docker compose up --build`.                            |
| `plum run-test` (local) | Unchanged. Operates on `./tests` in the cwd. The split is server-side only.                                                                                                                                                                     |
| First user              | Created in the UI on first boot, together with the org + first project. CLI account creation removed.                                                                                                                                           |

---

## Target layout (server host)

```
~/plum/
  .plum-server.json
  docker-compose.override.yml     # one bind-mount line per project
  reports/
  projects/
    checkout/  tests/  (full scaffold, own utils/browser.ts, own .env)
    payments/  tests/  ...
    marketing/ tests/  ...
```

Override maps `~/plum/projects/<slug>/tests` → `/app/projects/<id>`.
A run for project `<id>` sets `TESTS_ROOT=/app/projects/<id>` and loads
`/app/projects/<id>/.env`.

---

## Fresh-server flow (target)

```bash
npm install -g plum-e2e
mkdir ~/plum && cd ~/plum
plum server start                 # Docker up, migrations run, no projects yet
# open the UI → wizard: organization + first project + admin account
plum project init checkout        # scaffolds ~/plum/projects/checkout/, adds the
                                  # mount, restarts the backend container
nano ~/plum/projects/checkout/.env
# assign users to projects in the UI
```

---

## Phase branching

Each phase branches from the previous phase's branch (not `master`) until phases
start merging. PR per phase, reviewed, then merged forward.

```
master
 └── 299-multi-project-plan            (this doc)
      └── 299-p1-schema
           └── 299-p2-backend-scoping
                └── 299-p3-first-boot
                     └── 299-p4-tests-root
                          └── 299-p5-frontend
                               └── 299-p6-docs
```

---

## P1 — schema + migration

**New models**

```prisma
model Organization {
  id        Int       @id @default(autoincrement())
  name      String
  createdAt DateTime  @default(now())
  projects  Project[]
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId Int
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String   @default("member")   // "admin" | "member"
  createdAt DateTime @default(now())

  @@unique([projectId, userId])
  @@index([userId])
}
```

**`Project` changes** — drop the singleton assumption:

- add `orgId Int` + relation, `slug String @unique`, `baseUrl String @default("")`
- keep the existing config columns (prefixes, seq counters, webhooks, retries, `mcpKey`)
- backup columns stay on `Project` for now — moving them would break `backupService`
  / `backupCronService` on boot before P2 rewires the readers. Relocate to
  `Organization` in a later phase, once those readers take an org id.
- add `members ProjectMember[]`, and `projectId` back-relations to the scoped models

**`projectId` (required) added to:** `TestSuite`, `TestCase`, `TestRun`, `Report`,
`CronJob`, `RunQueue`. `Recording` inherits via `Report`. Matching `@@index` each.

**Migration** — one hand-written `migration.sql` (`prisma migrate deploy` runs it on
container boot against real data):

1. create `Organization`, `ProjectMember` (+ its unique/index)
2. `Project`: add `orgId`/`slug` nullable, `baseUrl` with a default
3. ensure a `Project` row exists (fresh installs create it lazily); fix the id sequence
4. `INSERT` org `"Default"`; set every project's `orgId` + `slug` (`default` for the
   lowest id)
5. `NOT NULL` + unique `slug` + FKs on `Project` / `ProjectMember`
6. one `ProjectMember(role: "admin")` per existing user for the default project
7. per scoped table: add `projectId` nullable → backfill to the default project →
   `NOT NULL` → FK (`onDelete: Cascade`) → index

**Status: done.** Verified against the populated dev DB — Default org + project,
existing user is an admin member, the one report scoped to project 1, `projectId`
`NOT NULL`, backend boots, all read APIs still 200.

---

## P2 — backend scoping

**New:** `backend/middleware/requireProjectAccess.js`

- resolves the project id from `X-Plum-Project` header (fallback: route param / body)
- global `admin` → allow any; otherwise require a `ProjectMember` row
- sets `req.projectId`
- runs after `jwtAuth`, before the handler

**New:** `backend/lib/projectContext.js` — `resolveProjectId(req)` +
`assertMember(userId, projectId)`, so routes and the MCP path share one code path.

**Touched routes** (add `requireProjectAccess`, scope every query by `req.projectId`):
`tests`, `reports`, `cron`, `test-suites`, `test-cases`, `test-runs`, `trigger`,
`active-runs`, `mcp`.

**Services** — thread `projectId` through the query layer:
`testCaseService`, `testSuiteService`, `testRunService`, `reportService`,
`cronService`, `runQueueService`, `triggerService`, `exportService`,
`testImportService`.

**`settingsService`** — replace `where: { id: 1 }` everywhere with `where: { id: projectId }`.
Split into project-scoped (`getProject(projectId)`) and org-scoped
(`getOrg()` for backup).

**MCP key** — `bootstrapMcpKey` becomes per-project; `jwtAuth`'s MCP branch resolves
the key → its project → `req.projectId`.

**Users routes** — add `GET/PUT /projects/:id/members` (admin only).

**Acceptance:** a `member` token for project A gets `403` on any project B route;
an `admin` token works everywhere; existing single-project API calls still work
when `X-Plum-Project` points at the Default project.

---

## P3 — first-boot (interactive)

**Backend** — `userService.needsSetup()` → `organization.count() === 0`.
`/auth/setup` body: `{ organizationName, projectName, name, email, password }`,
all required. One transaction: Organization → Project (`slug` from `projectName`)
→ admin User → `ProjectMember(role: "admin")`. Returns the login token.

**CLI** — `bin/plum.js`: delete the interactive account block (~L360–430). After
`plum server start`, print one line:

```
Open <uiUrl>/setup to create your organization and first project.
```

**Frontend** — `/setup` page (`routes/setup/+page.svelte`): a short guided form,
one field group at a time — Organization name → Project name → admin account.
Reuse existing inputs; copy strings go in `copy/auth.js`. On success, log in and
route to `/`.

**Acceptance:** fresh DB → `plum server start` → the UI wizard is the only way in;
finishing it lands on a working dashboard scoped to the new project.

---

## P4 — on-disk tests-root split

**New:** `backend/lib/testsRoot.js` — `resolveTestsRoot(projectId)` →
`/app/projects/<id>` (configurable base via `PROJECTS_DIR`, default
`<backend>/projects`). One helper, imported everywhere a path to test files is built.

**Executor / run path**

- `runExecutorService` + `run-tests.js`: `TESTS_ROOT = resolveTestsRoot(projectId)`
  for local runs; bundle that subtree for node dispatch (the payload shape in
  `nodeExecutionService.startJob` already handles `tests`).
- load `<testsRoot>/.env` at run time, merge into the spawn env (mirror the
  existing `userEnv` forwarding in `nodeExecutionService`). No new dotenv wiring
  in the backend process itself.

**Direct file readers** — `testService.getTestSuites(projectId)`,
`testCaseService.isTaggedInFeatures(projectId, id)`,
`reportService.syncAutomatedFromFeatures(projectId)`: take the id, resolve via
`testsRoot.js`.

**Watcher** — `serverBootstrap.watchTestFiles`: watch `projects/*/features`, debounce
per project, re-sync that project's automated flags.

**CLI** — `plum project init <name>`:

1. scaffold `~/plum/projects/<name>/` from `_scaffold`
2. append the bind-mount to `docker-compose.override.yml` (via
   `serverConfig.buildOverrideYaml` — extend it to take a `projects[]` list)
3. `docker compose up -d` to restart the backend with the new mount
4. print the next steps (see below)

Keep `plum init` as an alias with a deprecation note.

**`plum project init` output** — short, code-first:

```
✓ Project "checkout" scaffolded at projects/checkout/

Next:
  1. Set the app URL:      nano projects/checkout/.env      # BASE_URL=...
  2. Create the project in the UI (Settings → Projects) and assign members.
  3. Point your deploy at it:   git pull  projects/checkout   (on merge to main)

  plum run-test              # try it locally first
```

**Acceptance:** two scaffolded projects with different `BASE_URL`s run independently;
editing one project's `.env` changes only that project's next run, no restart;
`git pull` into a project folder is reflected on the next run and in the UI list.

---

## P5 — frontend

**Project switcher** — top nav, lists the user's projects (`GET /projects`),
persists the active one (`localStorage`, like `theme`). A store in
`stores/project.js`. All `lib/api/*` modules attach `X-Plum-Project` from that store
(one shared header helper, not per-file).

**Route loaders** — read the active project; guard against a stale id (fall back to
the first accessible project).

**Settings split**

- **Org settings** (admin): members, instance backup.
- **Project settings**: prefixes, webhooks, `baseUrl`, MCP key.

**Projects admin screen** (`routes/settings/projects/`): create a project (name →
slug), list projects, assign/unassign members. Interactive and plain — a form and
a member checklist, reusing `EmptyState` / existing table styles.

**Auto-filter** — Reports, Automated Tests, Test Repository, Schedules pages show
only the active project's data (the API already scopes; the UI just sends the
header and shows the switcher).

**Acceptance:** a `member` in two projects switches between them and sees only that
project's reports/tests/schedules; an `admin` sees all projects plus the Projects
and Org settings screens.

---

## P6 — documentation rewrite

Rewrite the Outline collection + `README.md` + the scaffolded README string in
`bin/plum.js` from scratch. Principles:

- **Code first.** Lead with the commands. One or two sentences of context, then the
  block to run.
- **No over-explaining.** Cut the "why" unless a step fails without it. Delete
  anything the reader doesn't act on.
- **One path.** Document the common flow; edge cases go in a short "Notes" at the
  end of a page, not inline.
- **Short pages.** If a page needs a table of contents, split it.

Pages (target):

1. **Install** — prereqs + `npm i -g`, nothing else.
2. **Start the server** — `mkdir ~/plum && plum server start`, the wizard, done.
3. **Add a project** — `plum project init`, the `.env`, the deploy hook.
4. **Write tests** — the two-layer structure, `plum create-test` / `create-step`.
5. **Run & read reports** — `plum run-test`, the report page, replay.
6. **Nodes** — register, systemd.
7. **Schedules & integrations** — cron, Discord/Slack, external triggers.
8. **Backup** — instance backup config.

Kill: the multi-paragraph rationale sections, the duplicated setup explanations,
the "here's what this does and why" preambles.

**Acceptance:** a new user gets from zero to a green run by following Install →
Start the server → Add a project → Run, with no page longer than one screen of
prose.

---

## Coding rules (every phase)

- Routes stay thin — delegate to services immediately. No DB queries or transforms
  in handlers.
- Services own all queries + side effects. Use the shared `prisma.js`. Return plain
  objects; never leak secret fields (`mcpKey`, S3 keys) — mask in the public
  accessor.
- Constants: `projectId` header name, `PROJECTS_DIR`, role strings → one constants
  file each (`constants/` backend, `constants.js` frontend). No inline literals
  used in >1 place.
- Copy: every user-facing string (CLI output included where it's a Plum message)
  in `copy/*.js`. No literals in `.svelte`.
- Reuse before adding: check `components/ui/`, `lib/utils/`, `lib/api/`,
  `services/`, `lib/` before writing a new helper.
- Comments: default none. Add one only when the _why_ is non-obvious — a hidden
  constraint, an invariant, a workaround. Re-read every added comment before the PR
  and cut it if the code already says it.
- Windows: `spawn` npm/npx/docker with `{ shell: true }`; `process.execPath` not
  `'node'`; `path.join`; no `chmod`/`which`/`curl`/shell operators in scripts.
- One Prisma migration per schema change, in `backend/prisma/migrations/`.

```

```
