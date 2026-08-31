# Plum 3.0.0 — Multi-project

Plum goes from single-tenant to **multi-project**: one organisation, many projects,
per-project access, isolated automated tests, an audit log, and a round of security
hardening. This is a breaking change — read **Upgrading** before deploying.

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

### Backup

- Database backup is **instance-level** — one schedule, one timezone, one S3
  target for the whole database, configured on the organisation (Settings →
  Backup). It no longer silently follows the first project's settings.

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
