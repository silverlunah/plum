# Plum — Claude Code Instructions

## Stack

- **Frontend**: SvelteKit 5, port 5173. ESM, no TypeScript.
- **Backend**: Express + Socket.io, port 3001. CommonJS (`require`/`module.exports`).
- **Database**: PostgreSQL via Prisma ORM (`backend/services/prisma.js`).
- **Infrastructure**: Docker Compose (`docker-compose.yml`) for the server stack. Runner nodes run as a bare `PLUM_MODE=node` Node process (started by `plum node start` / the dev `manage-runners` script), not via Docker.

---

## Frontend Standards

### CSS

- All design tokens are in `frontend/src/lib/styles/tokens.css` as CSS custom properties (`--accent`, `--bg`, `--text`, etc.).
- Never use Tailwind. Never use inline `style=` attributes for themeable values.
- Component styles go in the component's `<style>` block (scoped by default in Svelte).
- When adding a new token color, add it to `tokens.css` first, then reference `var(--your-token)`.

### Constants and utilities

- Shared constants live in `frontend/src/lib/constants.js`: `API_BASE`, `BROWSERS`, `TRIGGER_TYPES`, `WORKER_OPTIONS`, `REPORTS_PER_PAGE`, `COPY_TIMEOUT_MS`, `TOAST_TIMEOUT_MS`.
- Format/display utilities live in `frontend/src/lib/utils/format.js`: `isScheduled`, `triggerLabel`, `triggerVariant`, `stagger`, `fmtDuration`.
- Never hardcode the API URL — always use `API_BASE` from constants.
- Never hardcode magic numbers that belong in constants.

### API layer

- All backend calls go through `frontend/src/lib/api/` modules (e.g., `reports.js`, `runners.js`).
- Each module exports typed async functions. Route pages import from there, not from raw `fetch`.

### Components

Reuse shared components before creating new ones:

| Component      | Path                                       | Purpose                          |
| -------------- | ------------------------------------------ | -------------------------------- |
| `EmptyState`   | `$lib/components/ui/EmptyState.svelte`     | Zero-item states                 |
| `ConfirmModal` | `$lib/components/ui/ConfirmModal.svelte`   | Destructive action confirmations |
| `Toast`        | `$lib/components/ui/Toast.svelte`          | Transient feedback messages      |
| `BrowserIcon`  | `$lib/components/icons/BrowserIcon.svelte` | Browser logo icons               |

### State management

- Global runtime state lives in `frontend/src/lib/stores/runner.js` (`runnerState`, `runnerConfig`, `panelExpanded`, etc.).
- `reportsVersion` and `testsVersion` are increment-to-refresh signals — increment them to trigger dependent reactive blocks without page reloads.

### Route pages

- Pages are thin: they load data and delegate display to components.
- `+page.js` (load function) handles server-side or initial data fetching.
- No business logic inside route page files.

---

## Backend Standards

### File layout

```
backend/
  app.js            — Express setup, middleware, static routes
  routes/           — Thin HTTP handlers only
  services/         — All business logic
  websockets/       — Socket.io event handlers
  lib/              — Pure utility functions
  constants/        — Shared constant definitions
  config/scripts/   — CLI scripts (generate-report, install, etc.)
  prisma/           — Schema and migrations
```

### Routes

Routes delegate immediately to services. No business logic in route handlers.

```js
// Good
router.get('/:id', async (req, res, next) => {
  try {
    const report = await reportService.getReportDetail(Number(req.params.id));
    if (!report) return res.status(404).json({ error: 'Not found' });
    res.json(report);
  } catch (e) { next(e); }
});

// Bad — business logic in the route
router.get('/:id', async (req, res) => {
  const row = await prisma.report.findUnique({ where: { id: ... }, include: { ... } });
  const features = row.content.features.map(f => { /* transform */ });
  res.json(features);
});
```

### Services

- Services own all DB queries, data transformation, and side effects (file I/O, etc.).
- Use `backend/services/prisma.js` as the shared Prisma client — do not create new instances.
- Services return plain JS objects, not Prisma model instances with extra methods.

### Constants

- Trigger types and runner IDs live in `backend/constants/triggers.js`.
- Never use raw string literals for values that are used in more than one place.

### Screenshots / file storage

- Screenshot files are stored in `reports/screenshots/` (resolved at runtime via `REPORTS_DIR`).
- Express serves them via `app.use('/screenshots', express.static(SCREENSHOTS_DIR))`.
- DB stores only the filename, not the path or full URL.
- Frontend constructs the full URL with `screenshotUrl(filename)` from `$lib/api/reports.js`.

---

## Comments

Default: **no comments**.

Add a comment only when the **WHY** is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug, or behavior that would surprise a future reader.

Never write comments that:

- Explain what the code does (well-named identifiers already do that)
- Describe the current task or fix ("added for the live page", "handles issue #123")
- Are multi-line docblocks explaining parameters

The GPL license header at the top of every file is a legal requirement — do not remove it.

---

## General Rules

- **No Tailwind, no Bootstrap, no utility-class frameworks.**
- **No hardcoded URLs or magic strings** — use constants.
- **No premature abstractions** — three similar lines is better than a helper created for two cases.
- **No backwards-compat hacks** — rename, re-export, or add `_unused` prefixes only when explicitly asked.
- **No error handling for scenarios that cannot happen** — trust internal guarantees; only validate at system boundaries (user input, external APIs).
- **No half-finished implementations** — if a feature cannot be completed, say so before starting.
- **Prefer editing existing files** over creating new ones.

---

## Database

- All schema changes require a Prisma migration file in `backend/prisma/migrations/`.
- Run `npx prisma migrate deploy` (or rebuild Docker) to apply.
- Report content is stored as JSONB in the `Report.content` column — never reconstruct report metadata from filenames.
- The `getReports()` service function is paginated (`page`/`limit`) and deliberately excludes `content` for list performance — only `getReportDetail(id)` fetches it.

---

## Docker

- Rebuild after any backend dependency or schema change: `docker-compose up --build -d`
- The backend container runs `prisma migrate deploy` on startup before starting Express.
- Frontend dev server (`npm run dev`) runs outside Docker for fast HMR.

---

## Windows Compatibility

Plum runs on Windows. Every script and service must work on Windows without modification.

### `spawn` — always use `{ shell: true }` for npm/npx/docker

On Windows, `npm`, `npx`, and `docker` are `.cmd` wrappers, not binaries. Without `shell: true`, `spawn` cannot find them.

```js
// Good
spawn('npm', ['run', 'test'], { env, shell: true });

// Bad — breaks on Windows
spawn('npm', ['run', 'test'], { env });
```

`execSync` and `exec` use the system shell by default, so they are fine without `shell: true`.

### Spawning Node.js — use `process.execPath`, not `'node'`

```js
// Good
spawn(process.execPath, [scriptPath], { stdio: 'inherit' });

// Bad — 'node' may not be in PATH or may resolve to the wrong version
spawn('node', [scriptPath]);
```

### File paths — always use `path.join()` or `path.resolve()`

Never build paths by concatenating strings with `/`. Use `path.join()` everywhere.

When a path is written into a YAML or config file (e.g., docker-compose override), normalise Windows backslashes: `absPath.replace(/\\/g, '/')`.

### Forbidden Unix-only APIs in Node.js scripts

Never call these from `.js` scripts — they do not exist on Windows:

- `chmod` / `chown` — use `fs` permissions APIs if needed
- `which` — use `which` npm package or check `PATH` manually
- `curl` / `wget` — use Node.js `fetch` or `https` module
- Shell operators (`&&`, `||`, `$(cmd)`) inside strings passed to `execSync` — split into separate `execSync` calls instead
