![Plum social preview](https://repository-images.githubusercontent.com/936477779/3accb0f2-72b4-447c-b255-d171f6284104)

<p align="center">
  <a href="https://www.npmjs.com/package/plum-e2e"><img src="https://img.shields.io/npm/v/plum-e2e?color=7c3aed&label=plum-e2e" alt="npm version" /></a>
  <a href="https://github.com/silverlunah/plum/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license" /></a>
  <a href="https://outline.silverlunah.com/collection/plum-XRoE2MURWj"><img src="https://img.shields.io/badge/docs-outline-7c3aed" alt="docs" /></a>
</p>

<p align="center">
  A ready-to-use E2E test automation environment built on <a href="https://playwright.dev">Playwright</a> + <a href="https://cucumber.io">Cucumber</a>.<br/>
  Write tests in Gherkin, run them from the CLI or UI, view reports, schedule jobs, manage your entire test case repository, and get notified on Discord or Slack — all in one place.
</p>

---

## Requirements

- [Node.js](https://nodejs.org) v20.12 or higher (Node 22 LTS recommended)
- [Docker](https://www.docker.com) — required for `plum server start` (the web UI stack). Nodes (`plum node start`) run as a plain Node process and **do not need Docker**.

---

## Quick Start

### For users

```bash
# 1. Install Plum globally
npm install -g plum-e2e

# 2. Create a project folder and initialize it
mkdir my-tests && cd my-tests
plum init

# 3. Set your app URL
# Edit .env → BASE_URL=https://your-app.com

# 4. Run the example tests locally (no server needed)
plum run-test

# 5. Start the web UI (requires Docker)
plum server start
```

On first start, Plum asks whether you're setting up on a **local machine** or a **production / network server**, and whether to use the default ports (backend `3001`, frontend `3002`). Then open **http://localhost:3002** and sign in with the account you create.

### For contributors

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init        # installs all monorepo dependencies
npm run docker:up   # builds and starts the full stack
```

The UI is available at **http://localhost:3002**. For fast HMR while developing the frontend, run the Vite dev server outside Docker (`http://localhost:5173`) — see the **Development** section below.

---

## Documentation

Full documentation is available at:

**[https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd)**

| Guide                                                                                                                                      | What it covers                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [Installation](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/installation-JftwFX9csC)                         | Requirements, global install, first-user setup, plugins       |
| [Initializing the Project](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/initializing-the-project-ilfc8LUyO7) | What `plum init` generates, config files explained            |
| [Writing Tests](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/writing-tests-XeHJQdtH49)                       | Feature files, page objects, step definitions, best practices |
| [Running Tests Locally](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/running-tests-locally-GGhFcqaAQ8)       | `plum run-test` flags, parallel runs, debugging tips          |
| [Reports & Session Replay](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/reports-session-replay-EfhxJXaaDD)   | The report page, session replay, step rail, inspector, export |
| [Retrying Flaky Tests](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/retrying-flaky-tests-NXwRF5SXru)         | Auto-retry failed scenarios, global setting, report badges    |
| [Setting Up the Server](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/setting-up-the-server-vj0Ab1kJVs)       | Production server setup, reverse proxy (Nginx/Caddy), Docker  |
| [Setting Up Nodes](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/setting-up-nodes-dtmekJGJia)                 | Nodes, systemd service, managing nodes                        |
| [Integrations](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/integrations-qfiqfmdP0j)                         | Discord & Slack webhook notifications, CI/external triggers   |
| [Backup](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/backup-RNNObJfct9)                                     | Backup strategy                                               |

---

## Command Reference

| Command                       | Description                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plum init`                   | Initialize a new project in the current folder                                                                                                   |
| `plum server start`           | Start the full UI stack via Docker                                                                                                               |
| `plum server restart`         | Rebuild Docker images and restart the server without prompts                                                                                     |
| `plum server stop`            | Stop the server (data preserved)                                                                                                                 |
| `plum server reconfig`        | Re-enter server settings without starting                                                                                                        |
| `plum update`                 | Update Plum if a newer version is published, then restart every registered server and node (asks before each); no-ops when already on the latest |
| `plum node start [name]`      | Register a node with the server and start it on this machine                                                                                     |
| `plum node list`              | List this machine's nodes and their status                                                                                                       |
| `plum node restart [name]`    | Stop, refresh dependencies, and restart a node                                                                                                   |
| `plum node stop [name]`       | Stop a node                                                                                                                                      |
| `plum node delete <name>`     | Stop the node, delete its local config, and unregister it from the server                                                                        |
| `plum node reconfig [name]`   | Re-enter a node's settings and re-register, without starting it                                                                                  |
| `plum run-test`               | Run all tests locally without Docker                                                                                                             |
| `plum run-test @tag`          | Run tests matching a tag                                                                                                                         |
| `plum run-test --parallel N`  | Run tests across N parallel workers                                                                                                              |
| `plum run-test --browser <b>` | Run in `chromium` (default) or `firefox`                                                                                                         |
| `plum run-test --help`        | Show usage for `run-test`                                                                                                                        |
| `plum create-step`            | Interactively scaffold a new step definition                                                                                                     |
| `plum create-test`            | Interactively scaffold a full feature (`.feature` + Page + Steps)                                                                                |
| `plum manage-nodes`           | Open the interactive node management menu                                                                                                        |

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

### Backend — writing and running tests

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

```
backend/tests/
  features/          — Gherkin .feature files
  step_definitions/  — TypeScript step implementations
  pages/             — Page Object Models
  utils/             — Browser setup, hooks, helpers
```

> After any backend dependency or schema change, rebuild: `npm run docker:up`

---

<p align="center">
  Plum is free and open source. If you'd like to show some love:<br/>
  <a href="https://www.paypal.me/silverlunah">PayPal</a> · <a href="https://wise.com/pay/me/janneserjosee">Wise</a>
</p>
