![Plum social preview](https://repository-images.githubusercontent.com/936477779/3accb0f2-72b4-447c-b255-d171f6284104)

<p align="center">
  <a href="https://www.npmjs.com/package/plum-e2e"><img src="https://img.shields.io/npm/v/plum-e2e?color=7c3aed&label=plum-e2e" alt="npm version" /></a>
  <a href="https://github.com/silverlunah/plum/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="license" /></a>
  <a href="https://github.com/silverlunah/plum/wiki"><img src="https://img.shields.io/badge/docs-wiki-informational" alt="docs" /></a>
</p>

<p align="center">
  A ready-to-use E2E test automation environment built on <a href="https://playwright.dev">Playwright</a> + <a href="https://cucumber.io">Cucumber</a>.<br/>
  Write tests in Gherkin, run them from the CLI or UI, and view reports — all in one place.
</p>

---

## Requirements

- [Node.js](https://nodejs.org) v18 or higher
- [Docker](https://www.docker.com) — required for `plum server start` and `plum node start`

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
├── .gitignore             — Pre-configured to exclude reports/
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

Once running, open **http://localhost:5173** in your browser.

> Docker must be running before you use this command. Plum builds and starts the backend, database, and UI automatically.

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

Use `plum dev` to run tests directly on your machine without Docker:

```bash
plum dev                         # run all tests
plum dev @test-login-1           # run a single scenario
plum dev @suite-login            # run an entire suite
plum dev --parallel 4            # run all tests across 4 workers
plum dev --parallel 4 @suite-login  # run a suite in parallel
```

> `plum dev` syncs your tests, installs dependencies, and runs Cucumber. No Docker needed.

---

## 4. Runner Setup

Runners are additional machines that can execute tests in parallel alongside the primary server. This lets you distribute a large test suite across multiple nodes.

### Add a local runner node

On the machine that will act as a runner, navigate to your Plum project and run:

```bash
plum node start --token your-secret-token
```

| Flag      | Description                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| `--token` | A secret token the primary server must send to authenticate. Keep this private. |

> The runner starts a Docker container on port `3001` by default. Make sure Docker is running.

### Register the runner in the UI

Once the node is running:

1. Open the Plum UI at **http://localhost:5173**
2. Go to **Settings → Runners**
3. Click **Add Runner** and enter the node's URL, token, and a name

The runner will appear in the UI and can be selected when triggering tests.

### Stop a runner node

```bash
plum node stop
```

---

## Command Reference

| Command                       | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `plum init`                   | Initialize a new project in the current folder           |
| `plum server start`           | Start the full UI stack via Docker (alias: `plum start`) |
| `plum server stop`            | Stop the server and preserve data (alias: `plum stop`)   |
| `plum dev`                    | Run all tests locally without Docker                     |
| `plum dev @tag`               | Run tests matching a tag                                 |
| `plum dev --parallel N`       | Run tests across N parallel workers                      |
| `plum create-step`            | Interactively scaffold a new step definition             |
| `plum node start --token <t>` | Start a runner node on this machine                      |
| `plum node stop`              | Stop the runner node                                     |

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
