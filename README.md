![Plum social preview](https://repository-images.githubusercontent.com/936477779/3accb0f2-72b4-447c-b255-d171f6284104)

<p align="center">
  <a href="https://www.npmjs.com/package/plum-e2e"><img src="https://img.shields.io/npm/v/plum-e2e?color=7c3aed&label=plum-e2e" alt="npm version" /></a>
  <a href="https://github.com/silverlunah/plum/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="license" /></a>
  <a href="https://github.com/silverlunah/plum/wiki"><img src="https://img.shields.io/badge/docs-wiki-informational" alt="docs" /></a>
</p>

<p align="center">
  A ready-to-use E2E test automation environment built on <a href="https://playwright.dev">Playwright</a> + <a href="https://cucumber.io">Cucumber</a>.<br/>
  Write tests in Gherkin, run them from the CLI or UI, view reports, and manage your entire test case repository — all in one place.
</p>

---

## Requirements

- [Node.js](https://nodejs.org) v18 or higher
- [Docker](https://www.docker.com) — required for `plum server start` (the web UI stack). Runner nodes (`plum node start`) run as a plain Node process and **do not need Docker**.

---

## 1. Installation

### Install Plum globally

```bash
npm install -g plum-e2e
```

> The `-g` flag is required. Plum is a CLI tool — it must be installed globally to use `plum` commands anywhere on your machine.

### Initialize a new project

Create a folder for your tests and run `plum init` inside it:

```bash
mkdir my-tests
cd my-tests
plum init
```

This sets up your project with a working test scaffold:

```
my-tests/
├── tests/
│   ├── features/          — Gherkin .feature files (your test cases)
│   ├── step_definitions/  — TypeScript step implementations
│   ├── pages/             — Page Object Models
│   └── utils/             — Browser setup, hooks, shared helpers
├── .env                   — Base URL and browser settings
├── .gitignore             — Pre-configured to exclude .env and reports/
├── plum.plugins.json      — Add extra npm packages for your tests
└── tsconfig.json          — IDE type resolution (no local install needed)
```

The `tests/` folder includes working example tests against [SauceDemo](https://www.saucedemo.com/v1/) so you can run something immediately.

### Configure your target URL

Open `.env` and set your application's URL:

```env
BASE_URL=https://your-app.com
IS_HEADLESS=false
```

| Variable      | Description                                          |
| ------------- | ---------------------------------------------------- |
| `BASE_URL`    | The URL Playwright opens at the start of tests       |
| `IS_HEADLESS` | `true` to run headlessly, `false` to see the browser |

### Add extra packages (optional)

If your tests need additional npm packages, add them to `plum.plugins.json`:

```json
{
	"dependencies": {
		"@faker-js/faker": "^9.0.0"
	}
}
```

Plum installs these automatically before each run. Commit this file so your whole team uses the same packages.

---

## 2. Starting the Server

Plum includes a full web UI for triggering tests, viewing reports, and scheduling runs.

### Start

```bash
plum server start
```

or the shorthand:

```bash
plum start
```

The first time you run it, Plum asks a few questions (press Enter to accept the default shown in parentheses):

| Prompt                 | Default                   | What it sets                                                            |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------- |
| **App URL (BASE_URL)** | from your `.env`          | The URL Playwright opens at the start of every test                     |
| **Headless?**          | `No`                      | Whether browsers run hidden                                             |
| **Backend port**       | `3001`                    | Host port for the API                                                   |
| **Frontend (UI) port** | `5173`                    | Host port for the web UI                                                |
| **Primary public URL** | `http://<your-ip>:<port>` | The address you give runner nodes (see [Runner Setup](#4-runner-setup)) |

Your answers are saved to `.plum-server.json`, so the next `plum server start` reuses them without asking.

### First-user setup

On the very first start, Plum detects that no user accounts exist and prompts you to create one:

```
No users found — create your first account to get started.
✔ Your name … Jane Smith
✔ Email address … jane@example.com
✔ Password …
✓ Account created for jane@example.com. You can now log in.
```

After that, open the UI at the frontend port it prints (default **http://localhost:5173**) and sign in. Additional users can be invited from **Settings → Account** or the **Settings → Users** page.

> If you skip the CLI prompt, visit `http://localhost:5173/setup` in your browser to create the first account.

> Docker must be running before you use this command. Plum builds and starts the backend, database, and UI automatically.

**Skip the prompts** by passing flags (handy for CI):

```bash
plum server start --base-url https://your-app.com --headless true --backend-port 3001 --frontend-port 5173
```

### Change settings later

```bash
plum server reconfig
```

Re-asks every question and saves your answers **without** starting the stack. Run `plum server start` afterwards to apply them.

### Stop

```bash
plum server stop
```

or the shorthand:

```bash
plum stop
```

> Your data (reports, schedules, settings) is preserved in the database volume. Only the running containers are stopped.

---

## 3. Writing Tests

Plum uses [Cucumber](https://cucumber.io) and [Gherkin](https://cucumber.io/docs/gherkin/) to write human-readable test cases.

### Cucumber Basics

Gherkin is a plain-English language for writing test scenarios. Each test lives in a `.feature` file and follows this structure:

```gherkin
@suite-login
Feature: Login

  @test-login-1
  Scenario: User can log in with valid credentials
    Given I am on the login page
    When I enter valid credentials
    Then I should see the dashboard
```

**Key concepts:**

| Term               | What it is                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| `Feature`          | A group of related scenarios (one per file)                            |
| `Scenario`         | A single test case                                                     |
| `Given`            | Sets up the initial state                                              |
| `When`             | Performs an action                                                     |
| `Then`             | Asserts the expected outcome                                           |
| `Background`       | Steps that run before every scenario in a file                         |
| `Scenario Outline` | A parameterized scenario that runs once per row in an `Examples` table |
| `@tag`             | A label used to run specific tests or suites                           |

**Useful links:**

- [Gherkin syntax reference](https://cucumber.io/docs/gherkin/reference/)
- [Cucumber step definitions](https://cucumber.io/docs/cucumber/step-definitions/)
- [Playwright documentation](https://playwright.dev/docs/intro)

---

### Project Structure

Tests follow a three-layer structure: **Feature → Step Definition → Page Object**.

#### Feature File — what to test

```gherkin
# tests/features/Login.feature

@suite-login
Feature: Login

  @test-login-1
  Scenario: User can log in with valid credentials
    Given I am on the login page
    When I enter valid credentials
    Then I should see the dashboard
```

Tags (`@suite-login`, `@test-login-1`) let you run specific tests or entire suites. Every suite and scenario should have its own tag.

#### Page Object — how to interact with the page

```typescript
// tests/pages/LoginPage.ts

import { page } from '../utils/browser';

export class LoginPage {
	static async goToLoginPage() {
		await page().goto(process.env.BASE_URL as string);
	}

	static async enterCredentials(username: string, password: string) {
		await page().fill('#username', username);
		await page().fill('#password', password);
		await page().click('button[type="submit"]');
	}

	static async verifyDashboardVisible() {
		await page().waitForSelector('#dashboard');
	}
}
```

Methods are `static` and use the `page()` helper from `utils/browser.ts` — you never pass a page instance around.

#### Step Definition — connects Gherkin to code

```typescript
// tests/step_definitions/LoginSteps.ts

import { Given, When, Then } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';

Given('I am on the login page', async () => {
	await LoginPage.goToLoginPage();
});

When('I enter valid credentials', async () => {
	await LoginPage.enterCredentials('user@example.com', 'password123');
});

Then('I should see the dashboard', async () => {
	await LoginPage.verifyDashboardVisible();
});
```

---

### Generate a Step

Use `plum create-step` to interactively scaffold a new step definition and page object method:

```bash
plum create-step
```

Follow the prompts — Plum writes the boilerplate, you fill in the implementation.

---

### Run Tests Locally

Use `plum run-test` to run tests directly on your machine without Docker:

```bash
plum run-test                            # run all tests
plum run-test @test-login-1              # run a single scenario
plum run-test @suite-login               # run an entire suite
plum run-test --parallel 4               # run all tests across 4 workers
plum run-test --parallel 4 @suite-login  # run a suite in parallel
plum run-test --browser firefox          # run in a specific browser
```

| Flag               | Description                       |
| ------------------ | --------------------------------- |
| `@tag`             | Run only tests matching the tag   |
| `--parallel <n>`   | Run across `n` parallel workers   |
| `--browser <name>` | `chromium` (default) or `firefox` |

> `plum run-test` syncs your tests, installs dependencies, and runs Cucumber. No Docker needed.

---

## 4. Test Repository

Plum includes a built-in test case management system accessible from the **Test Repository** tab in the UI.

### Test Suites and Cases

Organise test cases into **suites**. Each suite and case gets an auto-assigned ID (e.g. `TS-001`, `TC-001`). The prefix is configurable in **Settings → Repository**.

Each test case has:

- **Title** and **Description**
- **Priority** — Critical, High, Medium, or Low
- **Test Steps** — an ordered table with columns: Action, Test Data, Expected Output
- **Automated tag** — a Cucumber `@tag` name that links this case to an automated scenario (e.g. `test-login-1`)
- **History** — a timeline of every result, from manual test runs and automated builds

### Linking automated tests

Set the **Automated tag** on a test case to match a Cucumber `@tag` in your feature files. After every automated run, Plum scans the results and:

1. Marks matching cases as **automated**
2. Records a pass/fail entry in the case's history

```gherkin
@test-login-1
Scenario: User can log in with valid credentials
```

If `TC-042` has `automatedTag = test-login-1`, it will be marked automated and updated after each build — no manual linking required.

### Test Runs

Create a **Test Run** (e.g. "Sprint 12 regression") and drag test cases from the suite browser into the run. Then switch to **Execute** mode to step through each case and mark it pass / fail / blocked / skip.

Results are recorded in the case's history and the run's progress bar updates in real time.

### Migrating IDs

If you change the test ID prefix (e.g. from `TC` to `CASE`), use **Settings → Repository → Run Migration** to rename all existing IDs at once. Cucumber tags in your code are intentionally left unchanged — update those separately.

---

## 5. Runner Setup

Runners are additional machines that execute tests in parallel alongside the primary server, letting you distribute a large suite across many nodes. A node runs as a plain Node process — **no Docker required**.

Each node automatically installs **Chromium and Firefox** — no browser selection needed. When triggering a test run from the UI, you choose which browser to use at run time.

### Start a runner node

On the machine that will act as a runner, navigate to your Plum project and run:

```bash
plum node start
```

Plum asks a few questions, **registers the node with your server automatically**, starts it in the background, then opens the runner management menu:

| Prompt             | Default                   | What it sets                                                         |
| ------------------ | ------------------------- | -------------------------------------------------------------------- |
| **Primary URL**    | last used                 | The server this node registers with (e.g. `http://192.168.1.5:3001`) |
| **Local port**     | `3001`                    | The port this node process listens on                                |
| **Advertised URL** | `http://<your-ip>:<port>` | The address the **server** uses to reach this node                   |
| **Runner name**    | `node-<random>`           | The name shown in the UI                                             |
| **Auth token**     | auto-generated            | Shared secret; press Enter to keep the generated one                 |

The node starts as a **background daemon** — your terminal is free immediately. Logs go to `backend/logs/runner-<id>.log`. Settings are saved to `.plum-node.json`, so re-running reuses them and never creates a duplicate.

After setup, the **runner management menu** opens automatically. From there you can start, stop, restart, and ping any runner registered on the primary. Exit the menu any time — the node keeps running.

**Skip the prompts** with flags (handy for CI or scripted nodes):

```bash
plum node start --primary http://192.168.1.5:3001 --port 3001 --name ci-node-1
```

| Flag               | Description                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `--primary <url>`  | Server to auto-register with. Omit to only print the details for manual entry.           |
| `--url <url>`      | Address the server calls back. Defaults to `<lan-ip>:<port>`; pass a domain to override. |
| `--port <n>`       | Local HTTP port the node listens on (default `3001`).                                    |
| `--token <secret>` | Auth token. Auto-generated and saved if omitted.                                         |
| `--name <name>`    | Runner name shown in the UI.                                                             |

#### Nodes behind a domain or reverse proxy

`--url` is the address the **server** calls back and is used exactly as given, while `--port` is the local port the node listens on. So a node behind an HTTPS reverse proxy is:

```bash
plum node start --primary https://plum.example.com --url https://node1.example.com --port 3001
```

The server reaches the node at `https://node1.example.com`; the proxy forwards to the node on port `3001`. The advertised `--url` must be reachable from the server.

### Manage runners

```bash
plum manage-runners
```

Opens the interactive runner management menu at any time (reads the primary URL from your saved node config). You can also pass a different server:

```bash
plum manage-runners --primary http://192.168.1.5:3001
```

> In development, the equivalent command is `npm run manage-runners` from the `backend/` directory.

### Change settings later

```bash
plum node reconfig
```

Re-asks every question, re-registers with the primary, and prints the updated card — **without** starting the node. Run `plum node start` afterwards to launch it.

### Register manually (fallback)

If you run `plum node start` without a reachable `--primary`, Plum prints the node's **name, url, and token** instead. Add it by hand:

1. Open the Plum UI at **http://localhost:5173**
2. Go to **Settings → Runners**
3. Click **Add Runner** and paste the node's URL, token, and name

### Stop a runner node

```bash
plum node stop
```

Stops the node started from the current folder. You can also stop individual runners from the `plum manage-runners` menu.

---

## Command Reference

| Command                       | Description                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `plum init`                   | Initialize a new project in the current folder                                 |
| `plum server start`           | Start the full UI stack via Docker, interactively (alias: `plum start`)        |
| `plum server reconfig`        | Re-enter server settings (URL, ports) without starting                         |
| `plum server stop`            | Stop the server and preserve data (alias: `plum stop`)                         |
| `plum run-test`               | Run all tests locally without Docker                                           |
| `plum run-test @tag`          | Run tests matching a tag                                                       |
| `plum run-test --parallel N`  | Run tests across N parallel workers                                            |
| `plum run-test --browser <b>` | Run in a specific browser (`chromium` or `firefox`)                            |
| `plum create-step`            | Interactively scaffold a new step definition                                   |
| `plum node start`             | Configure, register, and start a runner node; opens the runner management menu |
| `plum node reconfig`          | Re-enter node settings + re-register, without starting                         |
| `plum node stop`              | Stop the runner node started from this folder                                  |
| `plum manage-runners`         | Open the interactive runner management menu                                    |

---

## Development

> This section is for contributors developing Plum itself. If you're a user, the sections above are all you need.

### Clone and install

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init
```

`npm run init` installs all dependencies across the monorepo (root, backend, and frontend) in one command.

### Start the stack

```bash
npm run docker:up    # build and start all services (detached)
npm run docker:down  # stop all services
```

The UI will be available at **http://localhost:5173** after `docker:up` completes.

> After any backend dependency or schema change, re-run `npm run docker:up` to rebuild the containers.

### Backend — writing and running tests

All test development happens inside the `backend/` directory, where the Playwright + Cucumber runner lives:

```bash
cd backend
```

**Run tests:**

```bash
npm test                     # run all tests
npm test -- @test-1          # run a specific scenario by tag
npm test -- @suite-login     # run an entire suite
npm test -- --parallel 4     # run all tests in parallel
```

**Generate a step definition:**

```bash
npm run create-step
```

Interactive prompt that creates a new step and its page object method.

**Scaffold a new test:**

```bash
npm run create-test
```

Interactive prompt that creates a new `.feature` file, page object, and step definition file from a template — ready for you to implement.

**Manage runner nodes:**

```bash
npm run manage-runners
```

One interactive menu to **add** a new runner (registers it with the primary and optionally starts it), and to **start / stop / restart / ping** the local node processes it manages. In dev the primary runs in Docker and nodes run as bare host processes, reached via `host.docker.internal`. PIDs are tracked in `.runners.local.json` and logs go to `backend/logs/` so you can manage nodes across terminal sessions.

### Test file locations

```
backend/tests/
  features/          — Gherkin .feature files
  step_definitions/  — TypeScript step implementations
  pages/             — Page Object Models
  utils/             — Browser setup, hooks, helpers
```

### Frontend

The frontend dev server runs outside Docker for fast hot module replacement:

```bash
cd frontend
npm run dev
```

Available at **http://localhost:5173**. The backend (via Docker) serves API requests at **http://localhost:3001**.

---

<p align="center">
  Plum is free to use. If you'd like to show some love:<br/>
  <a href="https://www.paypal.me/silverlunah">PayPal</a> · <a href="https://wise.com/pay/me/janneserjosee">Wise</a>
</p>
