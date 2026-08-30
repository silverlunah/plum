# Plum 3.0.0 — Multi-project

Plum goes from single-tenant to **multi-project**: one organisation, many projects,
per-project access, and fully isolated automated tests. This is a breaking change —
read "Upgrading" before deploying.

---

## Highlights

### Projects

- One **organisation** owns many **projects**. Each project is its own world:
  its own test repository, schedules, reports, run history, notifications,
  MCP key, ID prefixes, base URL and timezone.
- A **project switcher** in the top nav; every screen is scoped to the active
  project. The switcher updates live when a project is created or deleted.
- **Owner** creates and deletes projects (Settings → Project → _Other projects_).
  Deleting a project permanently removes its test cases, runs, reports, schedules
  and its `projects/<slug>/` folder — you confirm by typing the project's slug.

### Roles & access

- **Owner** — one per instance. Reaches every project and every account-wide
  setting (users, runner nodes, backup, project CRUD).
- **Admin** — full settings _within the projects they're assigned to_.
- **User** — sees the tests, reports and runs of assigned projects; no settings.
- Assign people per project in Settings → Project → _Members of this project_.
  The owner is always listed (read-only); admins and users can be added and
  removed at any time — removing someone only revokes access, their test cases
  and their name on past runs stay.
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

### First boot

- On a fresh install the UI opens a **setup wizard**: create the organisation,
  the first project and the owner account in one step. CLI account creation is
  removed.

### Live runs

- The bottom run bar shows **every project's** queued and running jobs for
  awareness, each tagged with a project chip. You can only open or cancel a run
  in the project you are **currently in** — a run from another project shows its
  label and project but isn't clickable; switch to that project to watch it.
  Runs in projects you don't belong to are also stripped of their tag, runner
  list and who-started-them.
- The run queue serialises by **runner node**, across all projects — two
  projects targeting the same node (or both using the built-in runner) queue
  FIFO; projects on disjoint nodes run in parallel.

### MCP

- **Every member has their own MCP key per project** (Settings → MCP, visible to
  all members). A client using it acts as that person, with their role, scoped
  to the project — and anything it creates or runs is tagged **"(MCP)"** on the
  suite, case, run and report. The key dies the moment the person loses access
  to the project.
- `PLUM_MCP_KEY` (CI) still authenticates as the owner, instance-wide.
- New MCP tools: `list_users` / `create_user` / `update_user` and
  `list_projects` / `create_project` / `update_project` — **owner only** (an
  owner login, an owner's key, or `PLUM_MCP_KEY`). Deleting a user or a project
  is deliberately **not** exposed over MCP — a human does that in the UI.
- Upgrading wipes the old single per-project key; each integration mints a
  personal one.

### Backup

- Database backup is **instance-level** — one schedule, one timezone, one S3
  target for the whole database, configured on the organisation (Settings →
  Backup). It no longer silently follows the first project's settings.

---

## Fixes shipped alongside

- Scheduled jobs are keyed by job id, not name, so two projects can each have a
  `nightly` schedule without stopping each other.
- Project and backup timezones are independent: the project timezone drives that
  project's cron test runs; the organisation timezone drives the backup schedule.
- Removed the obsolete "screenshots replaced by session replay" notice from the
  Reports page.

---

## Upgrading

`npx prisma migrate deploy` (or a Docker rebuild) applies the schema changes.
The migration is safe against populated databases:

1. Creates the `Organization` and `ProjectMember` tables.
2. Wraps the existing single project as project **1** under a `Default`
   organisation; every existing user becomes an **admin member** of it, and the
   first user becomes the **owner**.
3. Backfills `projectId` on every test suite, case, run, report, schedule and
   queue row to project 1.
4. Moves the backup + timezone config from project 1 to the organisation.

After upgrading:

- Move your existing `tests/` content into `~/plum/projects/<slug>/tests/` for
  the default project (or run `plum project init <slug>` for a clean scaffold).
- `docker compose up --build -d` to pick up the shared toolchain.
- Assign users to projects in Settings → Project → _Members_.

### Breaking

- **CLI account creation is removed** — the first account is made in the setup
  wizard.
- API routes for tests, reports, schedules, suites, cases, runs and MCP now
  require project context (the `X-Plum-Project` header, falling back to the
  caller's first project). Unauthenticated access to these routes is closed.
- MCP keys are per member per project and act with that member's role — the old
  single per-project key (which authenticated as the owner) is **wiped** on
  upgrade. Regenerate a personal key in Settings → MCP.
- Backup config set on a non-default project before the upgrade is not carried
  over — only the default project's (now the organisation's) config is kept.
