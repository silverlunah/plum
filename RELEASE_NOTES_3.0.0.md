# Plum 3.0.0 — Multi-project

Plum goes from single-tenant to **multi-project**: one organisation, many projects,
per-project access, isolated automated tests, an audit log, and a round of security
hardening. This is a breaking change — read **Upgrading** before deploying.

---

## 3.0.1 (hotfix)

- **Multi-runner runs no longer skip.** A distributed run (built-in + a node, or
  two nodes) was scanning the shared demo `tests/` folder for its tag instead of
  the project's own features, matching nothing and skipping with "No tests
  matched". Single-runner runs were unaffected.
- `plum node start` no longer crashes when it can't set the node to start on
  boot. On a headless server the `systemd --user` bus is often unreachable over
  SSH (no lingering session); the failure is now a warning with a
  `loginctl enable-linger` hint, and the node — which is already running —
  stays up.
- **`plum init` scaffolds a self-contained `tests/` folder** — feature files,
  `.env`, `tsconfig.json`, `.vscode/`, `plum.plugins.json`, `.gitignore` all
  inside `tests/`, the same layout a project has on the server. Open the `tests/`
  folder in your editor. `plum run-test` reads `tests/.env`, falling back to a
  root `.env` for projects made before this. Existing local projects keep
  working.
- Automated Tests page: heading is now "Automated Tests"; the "this list follows
  the folder" note sits in the header above the count.
- The live run header no longer shows a title chip that just repeats the case-ID
  list when the run has no test-run title.

---

## Highlights

### Projects

- One **organisation** owns many **projects**. Each project is its own world:
  its own test repository, schedules, reports, run history, notifications,
  per-member MCP keys, ID prefixes, base URL and timezone.
- A **project switcher** in the top nav; every screen is scoped to the active
  project. The switcher updates live when a project is created or deleted.
- **Owner** creates and deletes projects (Settings → Project → _Other projects_).
  Deleting a project permanently removes its test cases, runs, reports, schedules
  and its `projects/<slug>/` folder — you confirm by typing the project's slug.

### Roles & access

- **Owner** — reaches every project and every account-wide setting (users,
  runner nodes, backup, project CRUD). An instance can have **several owners**;
  an owner promotes another account in Settings → Users, and the last owner
  can't be demoted.
- **Admin** — full settings _within the projects they're assigned to_.
- **User** — sees the tests, reports and runs of assigned projects; no settings.
- Assign people per project in Settings → Project → _Members of this project_,
  with a search box for large teams. Owners are always listed (read-only);
  admins and users can be added and removed at any time — removing someone only
  revokes access, their test cases and their name on past runs stay.
- **"What can each role do?"** shows the full capability matrix.

### Automated tests, per project

- Each project is a directory under `~/plum/projects/<slug>/` carrying the
  **entire** test scaffold (`features/`, `step_definitions/`, `pages/`,
  `utils/`, `.env`, `package.json`, `cucumber.json`). Nothing is shared —
  Cucumber has no step namespacing.
- `cucumber` / `playwright` / `ts-node` are pinned centrally (shared
  `node_modules`); project folders carry test code + `.env` only. A run for a
  project sets `TESTS_ROOT` to its folder and loads its `.env` at run time
  (edits are live, no restart).
- The per-project `.env` is **BASE_URL only** — everything else is injected.
- Remote runner nodes need no per-project setup: the server bundles the right
  project's test files and env into the dispatch payload.
- Every member sees the built-in runner and all registered nodes in the run bar
  and can pick one for a run; only owners register or control nodes. The
  built-in-runner on/off switch is now instance-wide (owner-set, applies to
  everyone) instead of a per-browser preference.
- The API separates local test authoring from the server: `plum init` (no
  arguments) scaffolds a folder for `plum run-test` and needs neither Docker
  nor the server; `plum server start` runs the web UI and creates the
  `projects/` bind-mount target.

### First boot

- On a fresh install the UI opens a **setup wizard**: create the organisation,
  the first project and the owner account in one step. CLI account creation is
  removed.
- Step 2 shows a short **"Before you begin"** notice — Plum is self-hosted,
  stores everything on your own server, has no telemetry, and phones home only
  for an anonymous npm version check — with a required acknowledgement.

### Activity logs

- **Settings → Activity logs** (admins for their projects; the owner also sees
  an _Organization_ tab). An append-only record of who created, edited or
  deleted a suite, case, run, result, schedule, integration, member, user,
  project, node, backup setting or MCP key.
- Free-text search, filter by event type or person, paged 30 at a time.
- Names are stored as they were at the time (a `(MCP)` suffix when the change
  came through an MCP key), so a row still reads correctly after a rename or
  delete. A nightly job at 3:17 AM prunes entries past the retention window
  (default 90 days, owner-configurable, or keep forever).

### Live runs

- The bottom run bar shows **every project's** queued and running jobs for
  awareness, each tagged with a project chip. You can only open or cancel a run
  in the project you are **currently in** — a run from another project shows its
  label and project but isn't clickable.
- **Collaborative execution.** On a manual test run's page, everyone working it
  sees each other's assignments, results and notes live, no refresh.
- The run queue serialises by **runner node**, across all projects — two
  projects targeting the same node (or both using the built-in runner) queue
  FIFO; projects on disjoint nodes run in parallel.
- A run started over many case IDs no longer prints the whole
  `@TC-001 or @TC-002 or …` expression full-width — the live-run and report
  headers show the first few and a **"+N more"** toggle.

### Building and executing a test run

- The **Build** tab autosaves. Adding, removing or reordering a case persists
  immediately — the Save button is gone; **Start Execution** saves then begins.
- On the **Execute** tab you **claim** a case before recording its result. The
  Pass / Fail / Blocked / Skip buttons stay inactive until the case is assigned
  to you (**"Assign to me"**), so every result carries the name of whoever
  recorded it.
- An **automated** case shows only its automation verdict plus "Assign to me";
  claiming it reveals the manual override buttons — for when the automation
  itself is broken and a human needs to set the result.

### Flaky scenarios

- A scenario that **failed at least once, then passed on a retry** is marked
  **flaky** on the report — an amber status dot, a `FLAKY` pill, and a `FLAKY`
  badge plus a _flaky_ count in the header. The run still counts as a pass, so
  pass rate is unaffected; flaky is a separate signal. The report export carries
  a per-scenario `flaky` flag and a total. Needs retries enabled
  (Settings → Project → _Retry failed tests_).

### MCP

- **Every member has their own MCP key per project** (Settings → MCP, visible to
  all members). A client using it acts as that person, with their role, scoped
  to the project — and anything it creates or runs is tagged **"(MCP)"** on the
  suite, case, run and report. The key dies the moment the person loses access
  to the project.
- New MCP tools: `list_users` / `create_user` / `update_user` and
  `list_projects` / `create_project`. These are **organisation-wide and require
  the instance key** (`PLUM_MCP_KEY`) — a per-project key, even the owner's,
  cannot reach them. `update_project` works with a project key but only for that
  key's own project. Deleting a user or a project is deliberately **not**
  exposed over MCP.
- `PLUM_MCP_KEY` (CI) authenticates as the owner, instance-wide.
- Upgrading wipes the old single per-project key; each integration mints a
  personal one.

### Backup & retention

- Database backup is **instance-level** — one schedule, one timezone, one S3
  target for the whole database, configured on the organisation (Settings →
  Backup). It no longer silently follows the first project's settings.
- **Report retention** (Settings → Backup, owner): keep test reports and their
  session recordings for **30 / 60 / 90 days, or forever** (the default). A
  nightly job at 3:23 AM deletes anything older — recordings go with their
  report; manual-run history is kept.
- The Test Repository **Import / Export** is one card, and importing a
  test-case export now **matches by ID**: an existing suite or case is updated
  in place instead of skipped, a new one is added keeping its ID, and a case
  that lines up with a `.feature` tag is marked automated right away.
  Re-importing the same file no longer clones the whole repository.

### Security hardening

- The node-runner API (`/api/execute` and friends) — which materialises
  caller-supplied files and runs `npm test` with a caller-supplied env — is now
  mounted **only on runner nodes**, never the primary server, and requires
  `NODE_TOKEN` (it no longer passes through when the token is unset). Test paths
  that escape the job directory are rejected.
- The realtime channel is **authenticated** — a socket connection now requires a
  valid session, run triggering / cancelling and joining a run's page check
  project access, and a run's log and DOM-recording streams are delivered only
  to that project's members.
- JWTs are signed with a **generated secret** persisted on first boot (set
  `JWT_SECRET` yourself for a multi-replica backend) instead of a public default,
  and now carry a 30-day expiry.
- `POST /auth/login` is rate-limited. `GET /settings/project` no longer returns
  the project's webhook URLs. `PLUM_ALLOWED_ORIGINS` can pin the browser origin
  (CORS is otherwise open — safe, because auth is a header token, not a cookie).
- Registering a runner node and controlling the fleet (`POST /runners`, ping /
  stop / restart / delete, and the node list) now require **`PLUM_NODE_SECRET`**
  or the owner's session. `POST /runners` used to be open — anyone could register
  a rogue node, which then received the test tree and env secrets on dispatch —
  and any one node's token was accepted as a fleet-wide credential. The server
  generates and persists `PLUM_NODE_SECRET` on first boot and `plum server`
  prints it.
- Manual and scheduled backups no longer include node tokens (they were a live
  shared secret sitting in a file that gets copied to S3 and laptops); nodes
  re-register their token on the next `plum node start`.

---

## Fixes shipped alongside

- Manual **backup import** was broken for every file once projects landed — the
  importer still keyed suites, cases and cron jobs on their old global
  uniqueness. It now resolves the target project and re-points each row, so an
  export → import round-trip works again.
- Scheduled jobs are keyed by job id, not name, so two projects can each have a
  `nightly` schedule without stopping each other.
- Project and backup timezones are independent: the project timezone drives that
  project's cron test runs; the organisation timezone drives the backup schedule.
- After signing in, the Automated Tests page no longer needs a manual refresh to
  show the project's suites.
- Removed the obsolete "screenshots replaced by session replay" notice from the
  Reports page.
- The replay **element inspector** has a search box — match by text, CSS
  selector or XPath against the recorded page — and the Element tab now lists
  ranked **locators** (test id, role + name, id/class, CSS path, XPath) with a
  copy button and a "recommended" marker, close to Playwright's locator priority.
- The server stack restarts on its own — its containers now use
  `restart: unless-stopped`, so a reboot brings them back as soon as Docker
  starts.
- `plum node start` can register a node to **start on boot** (`--boot` /
  `--no-boot`, or the interactive prompt) using systemd (Linux), launchd (macOS)
  or a Scheduled Task (Windows). Toggle it from `plum manage-nodes`; `plum node
list` marks which nodes have it.
- **Settings → Runners** shows the node **registration secret**
  (`PLUM_NODE_SECRET`) — reveal + copy — and a **Regenerate** button that rolls
  it and pushes the new value to every online node automatically; offline nodes
  are listed for a manual update.
- CI triggers: a run started via `POST /trigger` can pass `baseUrl` to override
  the project's `BASE_URL` for that run — point each pull request at its own
  preview deployment. (Already worked; now documented, and the Settings snippet
  shows it.)
- Run-page and Settings polish: a run's case rows read as one card, notification
  toasts spin while an import / export / upload is in flight, the Test
  Repository header shows the project's total case count, and the Users / Backup
  / Runners settings panes match the standard header style.
- The license-header tool no longer touches `projects/` or `*.feature` files —
  it had been prepending a `/* … */` block to scaffolded feature files (breaking
  Gherkin) and to the persisted secret files under a project's `reports/`
  (invalidating sessions). If a `projects/<slug>/tests` folder has headed
  `.feature`/`.ts` files or a `reports/.plum-*-secret` starting with `/*`, delete
  the first four lines of each.

---

## Upgrading

`npx prisma migrate deploy` (or a Docker rebuild) applies the schema changes.
They are safe against populated databases. The data migration:

1. Creates the `Organization` and `ProjectMember` tables (later migrations add
   `McpKey`, `ActivityLog` and a few columns — all additive).
2. Wraps the existing single project as project **1** under a `Default`
   organisation; every existing user becomes an **admin member** of it, and the
   first user becomes the **owner**.
3. Backfills `projectId` on every test suite, case, run, report, schedule and
   queue row to project 1.
4. Moves the backup + timezone config from project 1 to the organisation.

After upgrading:

- Move your existing `tests/` content into `~/plum/projects/<slug>/tests/` for
  the default project (or run `plum project init "<name>"` for a clean scaffold).
- `docker compose up --build -d` to pick up the shared toolchain and migrations.
- Assign users to projects in Settings → Project → _Members_.
- **Everyone is signed out once.** The JWT secret changes on first boot after
  this release (the old public default could be used to forge tokens) — log in
  again.
- **Runner nodes** must be (re)started with `plum node start` / `plum node
restart` so the node process and its registration share a token; a node
  started by hand with no `NODE_TOKEN` will now refuse jobs. Registration also
  needs `PLUM_NODE_SECRET` — a node on the server machine (and `plum
  manage-nodes`) reads it from the running container automatically; a node on
  another machine takes it from `plum server`'s output via `--node-secret` or
  the interactive prompt.
- Regenerate a personal MCP key in Settings → MCP.

### Breaking

- **CLI account creation is removed** — the first account is made in the setup
  wizard, which now also requires accepting the first-run notice.
- API routes for tests, reports, schedules, suites, cases, runs and MCP now
  require project context (the `X-Plum-Project` header, falling back to the
  caller's first project). Unauthenticated access to these routes is closed.
- The realtime (Socket.io) channel now requires authentication — any custom
  client must pass the session token in the connection handshake.
- MCP keys are per member per project and act with that member's role — the old
  single per-project key (which authenticated as the owner) is **wiped** on
  upgrade. The account-admin MCP tools require `PLUM_MCP_KEY`, not a project key.
- Node runners require `NODE_TOKEN`; `plum node start` sets it, a hand-rolled
  node process must too. Registering one with the primary additionally requires
  `PLUM_NODE_SECRET` (from `plum server`), and the "Add Runner" form is gone from
  Settings → Runners — nodes register themselves via `plum node start`.
- Backup config set on a non-default project before the upgrade is not carried
  over — only the default project's (now the organisation's) config is kept.
