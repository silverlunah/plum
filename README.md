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

- [Node.js](https://nodejs.org) **20.12+** (22 LTS recommended)
- [Docker](https://www.docker.com), only for the web UI. Writing tests and running runner nodes need neither Docker nor the server.

---

## Install

```bash
npm install -g plum-e2e
mkdir my-tests && cd my-tests
plum init                    # add --framework cucumber for Gherkin
```

Set `BASE_URL` in `tests/.env`, then run:

```bash
npx playwright test          # a Cucumber project uses: npx cucumber-js
```

That's it. `plum init` scaffolds `tests/`, installs the runner and downloads browsers, so the example tests run straight away. Open `tests/` in your editor; it is the same layout a project has on the server, so it drops into `projects/<slug>/tests/` later if you add the UI.

Use `plum create-test` to scaffold a new test and page object.

---

## Server (web UI)

Run this on one machine for your team. It gives you the Test Repository, reports, session replay, schedules, notifications and MCP.

```bash
npm install -g plum-e2e
mkdir plum && cd plum
plum server start
```

It asks whether the machine is local or on a network, then brings up Docker, runs migrations and creates `projects/`. Open **http://localhost:3002** and finish setup: organisation, first project, owner account.

A few things worth knowing:

- Each project picks **Playwright or Cucumber** when it is created, and that choice is permanent.
- The server scaffolds `projects/<slug>/tests/` itself. `plum project init "<name>"` only re-creates a folder that went missing.
- Tests deeper than `tests/` (say `apps/web/e2e/`) go in **Settings → Project → Tests folder**, relative to `projects/<slug>/`. A project with a custom path is never scaffolded.
- Containers use `restart: unless-stopped`, so the server returns after a reboot. For nodes too, register with `plum node start <name> --boot`.

---

## Command reference

| Command                      | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| `plum init`                  | Scaffold a local `./tests/` folder. `--framework playwright\|cucumber`     |
| `plum create-test`           | Scaffold a test and page object. `--name <Name>` skips the prompt          |
| `plum create-step`           | Cucumber only: scaffold a step definition                                  |
| `plum server start`          | Start the UI stack via Docker                                              |
| `plum server restart`        | Rebuild images and restart, no prompts                                     |
| `plum server stop`           | Stop the server, data preserved                                            |
| `plum server reconfig`       | Re-enter server settings without starting                                  |
| `plum project init "<name>"` | Re-create a server project's tests folder                                  |
| `plum node start [name]`     | Register a node and start it here. `--boot` / `--no-boot`                  |
| `plum node list`             | This machine's nodes and their status                                      |
| `plum node restart [name]`   | Stop, refresh dependencies, restart                                        |
| `plum node stop [name]`      | Stop a node                                                                |
| `plum node delete [name]`    | Stop it, delete its config, unregister it. No name deletes every node here |
| `plum node reconfig [name]`  | Re-enter a node's settings, without starting                               |
| `plum manage-nodes`          | Interactive node management menu                                           |
| `plum update`                | Update Plum, then restart registered servers and nodes                     |

---

## Project layout

Playwright:

```
projects/<slug>/tests/
  playwright.config.ts   yours: browsers, timeouts, traces, reporters
  specs/                 *.spec.ts test files
  pages/                 Page Object Models (optional)
  fixtures/pages.ts      your page-object fixtures
  fixtures/plum.ts       session recording for report replay (Plum's)
```

Cucumber:

```
projects/<slug>/tests/
  cucumber.js            yours: paths, requires, formatters
  features/              Gherkin .feature files
  step_definitions/      TypeScript step implementations
  pages/                 Page Object Models (optional)
  utils/                 browser setup, hooks, helpers (Plum's recording lives here)
```

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

---

## Contributing

Everything below is for developing Plum itself. You don't need any of it to use Plum.

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init         # install all monorepo dependencies
npm run docker:up    # build and start the stack, UI on http://localhost:3002
npm run docker:down  # stop it
```

Rebuild with `npm run docker:up` after any backend dependency or schema change.

### Frontend hot reload

The container serves a production build, so run Vite outside Docker while working on the UI:

```bash
cd frontend
npm run dev          # 3002, or the next free port if the container has it
```

### Runner nodes

Nodes are bare Node processes, not containers. These register against your local server and clean up after themselves:

```bash
npm run nodes:up     # 2 nodes on 9001-9002 (npm run nodes:up -- 3 for more)
npm run nodes:list
npm run nodes:down   # stop and deregister
```

### Testing the CLI

Scaffolds a throwaway project per framework and drives it with the runner's own commands, covering `plum init` and the run flags end to end:

```bash
npm run cli:test        # both frameworks, one suite each (~40s)
npm run cli:test:full   # adds tags, file:line, browsers, workers, shards,
                        # retries, generators and tsc (~2min)
```

### Running a project's tests directly

Runs go straight to the project's own runner, from its tests folder:

```bash
cd projects/<slug>/tests
npx playwright test --grep @TC-001     # or: npx cucumber-js --tags @TC-001
npx playwright test --workers 4        # or: npx cucumber-js --parallel 4
```

Generators and the node menu live in `backend`:

```bash
cd backend
npm run create-test
npm run create-step
npm run manage-nodes
```

---

<p align="center">
  Plum is free and open source. If you'd like to show some love:<br/>
  <a href="https://www.paypal.me/silverlunah">PayPal</a> · <a href="https://wise.com/pay/me/janneserjosee">Wise</a>
</p>
