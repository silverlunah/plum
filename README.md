![Plum social preview](https://repository-images.githubusercontent.com/936477779/3accb0f2-72b4-447c-b255-d171f6284104)

<p align="center">
  <a href="https://www.npmjs.com/package/plum-e2e"><img src="https://img.shields.io/npm/v/plum-e2e?color=7c3aed&label=plum-e2e" alt="npm version" /></a>
  <a href="https://github.com/silverlunah/plum/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="license" /></a>
  <a href="https://outline.silverlunah.com/collection/plum-XRoE2MURWj"><img src="https://img.shields.io/badge/docs-outline-7c3aed" alt="docs" /></a>
</p>

<p align="center">
  A ready-to-use E2E test automation environment built on <a href="https://playwright.dev">Playwright</a> + <a href="https://cucumber.io">Cucumber</a>.<br/>
  Write tests in Gherkin, run them from the CLI or UI, view reports, schedule jobs, manage your entire test case repository, and get notified on Discord or Slack — all in one place.
</p>

---

## Requirements

- [Node.js](https://nodejs.org) v18 or higher
- [Docker](https://www.docker.com) — required for `plum server start` (the web UI stack). Runner nodes (`plum node start`) run as a plain Node process and **do not need Docker**.

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

Open **http://localhost:5173** and sign in with the account you create on first start.

### For contributors

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init        # installs all monorepo dependencies
npm run docker:up   # builds and starts the full stack
```

The UI is available at **http://localhost:5173**. The frontend dev server runs outside Docker for fast HMR — see the **Development** section below.

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
| [Setting Up the Server](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/setting-up-the-server-vj0Ab1kJVs)       | Production server setup, reverse proxy (Nginx/Caddy), Docker  |
| [Setting Up Nodes](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/setting-up-nodes-dtmekJGJia)                 | Runner nodes, systemd service, managing nodes                 |
| [Integrations](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/integrations-qfiqfmdP0j)                         | Discord & Slack webhook notifications                         |
| [Backup](https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd/doc/backup-RNNObJfct9)                                     | Backup strategy                                               |

---

## Command Reference

| Command                       | Description                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `plum init`                   | Initialize a new project in the current folder                                |
| `plum server start`           | Start the full UI stack via Docker (alias: `plum start`)                      |
| `plum server stop`            | Stop the server and preserve data (alias: `plum stop`)                        |
| `plum restart`                | Rebuild and restart the server without prompts (alias: `plum server restart`) |
| `plum update`                 | Update Plum to the latest version and restart the server                      |
| `plum server reconfig`        | Re-enter server settings without starting                                     |
| `plum run-test`               | Run all tests locally without Docker                                          |
| `plum run-test @tag`          | Run tests matching a tag                                                      |
| `plum run-test --parallel N`  | Run tests across N parallel workers                                           |
| `plum run-test --browser <b>` | Run in `chromium` (default) or `firefox`                                      |
| `plum create-step`            | Interactively scaffold a new step definition                                  |
| `plum node start`             | Set up connectivity, start a runner node, and open the runner menu            |
| `plum node stop`              | Stop the runner node started from this folder                                 |
| `plum node reconfig`          | Re-enter node settings and re-register                                        |
| `plum manage-runners`         | Open the interactive runner management menu                                   |

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
npm test -- @test-1          # run a specific scenario
npm test -- --parallel 4     # run in parallel
npm run create-step          # scaffold a step definition
npm run create-test          # scaffold a full test from template
npm run manage-runners       # open the runner management menu
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
