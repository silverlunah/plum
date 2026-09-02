![Plum social preview](https://repository-images.githubusercontent.com/936477779/c7897789-fd10-40dc-8cd5-5ebe41b59bfd)

<p align="center">
  <a href="https://www.npmjs.com/package/plum-e2e"><img src="https://img.shields.io/npm/v/plum-e2e?color=7c3aed&label=plum-e2e" alt="npm version" /></a>
  <a href="https://github.com/silverlunah/plum/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license" /></a>
  <a href="https://outline.silverlunah.com/collection/plum-XRoE2MURWj"><img src="https://img.shields.io/badge/docs-outline-7c3aed" alt="docs" /></a>
</p>

<p align="center">
  Self-hosted QA platform for teams doing manual <em>and</em> automated testing. Comes with a full test-case repository alongside a ready-to-use <a href="https://playwright.dev">Playwright</a> automation environment, or <a href="https://cucumber.io">Cucumber</a> if your team writes Gherkin.<br/><br/>
Each project picks Playwright or Cucumber when it's created. Run tests from the CLI or UI, track manual test runs, view and export reports, schedule jobs, and get Discord / Slack notifications.
</p>

---

## Requirements

- [Node.js](https://nodejs.org) **20.12 or newer** (Node 22 LTS recommended), enforced by the package's `engines` field.
- [Docker](https://www.docker.com), needed **only** for the server (web UI) stack. Writing and running tests locally needs neither Docker nor the server. Runner nodes (`plum node start`) run as a plain Node process and also don't need Docker.

---

## Quick Start

```bash
npm install -g plum-e2e

mkdir my-tests && cd my-tests
plum init                       # takes no arguments, scaffolds ./tests/

# edit tests/.env → BASE_URL=https://your-app.com

npx playwright test             # runs your tests locally, no Docker, no database
plum create-test                # scaffold a new test + page object for this project
```

`plum init` creates a self-contained `tests/` folder, feature files, steps, page objects, `.env`, `tsconfig.json`, `.vscode/`, `package.json`, the same layout a project has on the server. Open the `tests/` folder in your editor.

### Running the server (web UI: Test Repository, reports, schedules, MCP)

Run this on one machine for your team. It brings up the Docker stack, runs migrations, and, on first start, asks whether you're on a **local machine** or a **production / network server** and which ports to use (backend `3001`, frontend `3002`).

```bash
npm install -g plum-e2e
mkdir plum && cd plum
plum server start
```

`plum server start` creates the `projects/` folder (the bind-mount target) and the Docker config in the current directory. Open **http://localhost:3002**, complete first-run setup, and create your organisation, first project, and owner account. The server scaffolds each project's `projects/<slug>/tests/` folder itself when you add the project in **Settings → Project**, you don't run `plum init` or `plum project init` for that (`plum project init "<name>"` only re-creates a folder the server lost).

If a project's repo keeps its tests deeper than a top-level `tests/` (e.g. `apps/web/e2e/`), set that subpath in **Settings → Project → Tests folder**. It's always relative to `projects/<slug>/`; a project with a custom path manages that folder itself and is never scaffolded.

The stack's containers use `restart: unless-stopped`, so the server comes back after a reboot once Docker itself starts. To bring runner nodes back too, register them with `plum node start <name> --boot` (or answer the prompt).

### Writing tests (no server)

`plum init` scaffolds a self-contained `tests/` folder for the framework this install defaults to, specs (or feature files and step definitions), page objects, the runner config, `tests/.env`, `tests/tsconfig.json`, `tests/.vscode/`, `tests/package.json`, and installs the toolchain. Open the `tests/` folder in your editor; it's the same layout a project folder has on the server, so a local project drops straight into `projects/<slug>/tests/`. Nothing else is required to write and run tests on your machine.

### For contributors

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init        # installs all monorepo dependencies
npm run docker:up   # builds and starts the full stack
```

The UI is available at **http://localhost:3002**. For fast HMR while developing the frontend, run the Vite dev server outside Docker (`http://localhost:5173`), see the **Development** section below.

---

## Documentation

Full documentation is available at:

**[https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd)**

| Guide                                                                                                                                    | What it covers                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Installation](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/installation-JftwFX9csC)                       | Requirements, global install, first-user setup, plugins                            |
| [Setting Up the Server](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/setting-up-the-server-vj0Ab1kJVs)     | Production server setup, reverse proxy (Nginx/Caddy), Docker                       |
| [Setting Up Nodes](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/setting-up-nodes-dtmekJGJia)               | Runner nodes, the registration secret, start-on-boot, managing nodes               |
| [Running Tests Locally](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/running-tests-locally-GGhFcqaAQ8)     | Running tests natively, parallel runs, debugging tips                              |
| [Writing Tests](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/writing-tests-XeHJQdtH49)                     | Feature files, step definitions, optional page objects, best practices             |
| [Projects](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/projects-ilfc8LUyO7)                               | One organisation, many projects, anatomy, on-disk layout, create / switch / delete |
| [Roles & Access](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/roles-access-s0wx91Uo7g)                     | Owner / admin / user, per-project membership, what each role sees                  |
| [Test Repository](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/test-repository-NJh4BbRzcK)                 | Suites & cases, test runs, linking automation to cases by tag                      |
| [Reports & Session Replay](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/reports-session-replay-EfhxJXaaDD) | The report page, session replay, step rail, inspector, export                      |
| [Retrying Flaky Tests](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/retrying-flaky-tests-NXwRF5SXru)       | Auto-retry failed scenarios, global setting, report badges                         |
| [Integrations](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/integrations-qfiqfmdP0j)                       | Per-project Discord & Slack webhook notifications, CI/external triggers            |
| [MCP Integration](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/mcp-integration-yGjbsFrI76)                 | Per-member MCP keys, connecting an AI client, tools, `(MCP)` attribution           |
| [Activity Logs](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/activity-logs-5BJzE7o8oU)                     | Audit feed of project and org changes, MCP attribution, retention                  |
| [Backup](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/backup-RNNObJfct9)                                   | Instance-level database backup, schedule, S3 target                                |

---

## Command Reference

| Command                      | Description                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plum init`                  | Scaffold a self-contained `./tests/` folder for local test authoring                                                                             |
| `plum project init "<name>"` | Re-create a server project's `projects/<slug>/tests/` folder (the server normally does this when you add the project)                            |
| `plum server start`          | Start the full UI stack via Docker                                                                                                               |
| `plum server restart`        | Rebuild Docker images and restart the server without prompts                                                                                     |
| `plum server stop`           | Stop the server (data preserved)                                                                                                                 |
| `plum server reconfig`       | Re-enter server settings without starting                                                                                                        |
| `plum update`                | Update Plum if a newer version is published, then restart every registered server and node (asks before each); no-ops when already on the latest |
| `plum node start [name]`     | Register a node with the server and start it on this machine (`--boot` / `--no-boot` to (un)set start-on-boot)                                   |
| `plum node list`             | List this machine's nodes and their status                                                                                                       |
| `plum node restart [name]`   | Stop, refresh dependencies, and restart a node                                                                                                   |
| `plum node stop [name]`      | Stop a node                                                                                                                                      |
| `plum node delete <name>`    | Stop the node, delete its local config, and unregister it from the server                                                                        |
| `plum node reconfig [name]`  | Re-enter a node's settings and re-register, without starting it                                                                                  |
| `plum create-step`           | Interactively scaffold a new step definition                                                                                                     |
| `plum create-test`           | Scaffold a new test and page object, a `.spec.ts` for Playwright, a `.feature` + Steps for Cucumber. `--name <Name>` skips the prompt            |
| `plum manage-nodes`          | Open the interactive node management menu                                                                                                        |

---

## Development

> This section is for contributors developing Plum itself.

### Start the stack

```bash
npm run docker:up    # build and start all services (detached)
npm run docker:down  # stop all services
```

### Frontend (hot reload)

The frontend dev server runs outside Docker for fast HMR:

```bash
cd frontend
npm run dev          # available at http://localhost:5173
```

### Backend, writing and running tests

```bash
cd backend
npm test                     # run all tests
npm test -- @TC-001          # run a specific scenario
npm test -- --parallel 4     # run in parallel
npm run create-step          # scaffold a step definition
npm run create-test          # scaffold a full test from template
npm run manage-nodes         # open the node management menu
```

### Test file locations

A Playwright project:

```
projects/<slug>/tests/
  playwright.config.ts, yours: browsers, timeouts, traces, reporters
  specs/              , *.spec.ts test files
  pages/              , Page Object Models (optional)
  fixtures/plum.ts    , session recording for report replay
```

A Cucumber project:

```
projects/<slug>/tests/
  cucumber.js         , yours: paths, requires, formatters
  features/           , Gherkin .feature files
  step_definitions/   , TypeScript step implementations
  pages/              , Page Object Models (optional)
  utils/              , browser setup, hooks, helpers
```

> After any backend dependency or schema change, rebuild: `npm run docker:up`

---

<p align="center">
  Plum is free and open source. If you'd like to show some love:<br/>
  <a href="https://www.paypal.me/silverlunah">PayPal</a> · <a href="https://wise.com/pay/me/janneserjosee">Wise</a>
</p>
