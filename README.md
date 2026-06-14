![Plum social preview](https://repository-images.githubusercontent.com/936477779/e928fce3-6d4c-4609-92a0-0a1091c99752)

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

- [Node.js](https://nodejs.org) (v18+)
- [Docker](https://www.docker.com) — only needed for `plum start`

---

## Quick Start

```bash
npm install -g plum-e2e
mkdir my-tests && cd my-tests
plum init
```

---

## Setup & Configuration

### `plum init`

Scaffolds a new project in the current directory. Run this once after creating your project folder.

```bash
plum init
```

Creates the following structure:

<pre>
╠═ tests/
║  ╠═ features/          — Gherkin .feature files (your test cases)
║  ╠═ step_definitions/  — TypeScript step implementations
║  ╠═ pages/             — Page Object Models
║  ╚═ utils/             — Browser setup, hooks, shared helpers
╠═ .vscode/
║  ╚═ settings.json      — Cucumber extension config (step linking)
╠═ .env                  — Environment config (BASE_URL, IS_HEADLESS)
╠═ .gitignore            — Pre-configured to ignore .plum/ and reports/
╚═ plum.plugins.json     — Add extra npm packages for your tests here
</pre>

Also installs all Plum dependencies and the [Cucumber VS Code extension](https://marketplace.visualstudio.com/items?itemName=cucumberopen.cucumber-official) for step definition linking.

---

### `.env` — Environment Config

Plum creates a `.env` in your project root. Edit it to point at your app:

```env
BASE_URL=https://your-app.com
IS_HEADLESS=false
```

| Variable      | Description                                              |
| ------------- | -------------------------------------------------------- |
| `BASE_URL`    | The base URL Playwright navigates to during tests        |
| `IS_HEADLESS` | Run the browser headlessly (`true`) or visibly (`false`) |

---

### `plum.plugins.json` — Adding Packages

If your tests need extra npm packages (e.g. a faker library, an assertion helper), add them to `plum.plugins.json`:

```json
{
	"dependencies": {
		"@faker-js/faker": "^9.0.0",
		"dayjs": "^1.11.0"
	}
}
```

Plum installs these automatically before running tests. Commit this file so your whole team shares the same dependencies.

---

## Development Commands

### `plum dev` — Run Tests Locally

Runs tests directly on your machine without Docker. This is the fastest way to write and debug tests.

```bash
plum dev                        # run all tests
plum dev @test-login-1          # run a single scenario by tag
plum dev @suite-login           # run a whole suite by tag
plum dev --parallel 4           # run all tests across 4 workers
plum dev --parallel 4 @suite-x  # run a suite in parallel
```

> Syncs your `tests/` folder into Plum, installs dependencies, and runs Cucumber.

---

### `plum start` — Run via Docker

Starts the full Plum stack (backend + UI) in Docker. Use this when you want the web interface at `http://localhost:5173` to trigger, monitor, and schedule tests.

```bash
plum start
```

> Requires Docker to be running. Automatically rebuilds if you've changed plugins or config.

---

### `plum create-step` — Generate a Step

Interactive prompt that generates a new step definition and its Page Object method.

```bash
plum create-step
```

Follow the prompts to describe the action — Plum writes the boilerplate so you just fill in the implementation.

---

## Writing a Test

Tests follow a three-layer structure: **Feature → Step Definition → Page Object**.

### 1. Feature File

```gherkin
# tests/features/Login.feature

@suite-login
Feature: Login

  @test-login-1
  Scenario: User can log in with valid credentials
    Given I am on the login page
    When I log in with valid credentials
    Then I should see the dashboard
```

Use tags (`@suite-login`, `@test-login-1`) to filter which tests to run.

### 2. Page Object

```typescript
// tests/pages/LoginPage.ts

import { page } from '../utils/browser';

export class LoginPage {
	static async goToLoginPage() {
		await page().goto(process.env.BASE_URL as string);
	}

	static async login(email: string, password: string) {
		await page().fill('#email', email);
		await page().fill('#password', password);
		await page().click('button[type="submit"]');
	}

	static async verifyDashboardVisible() {
		await page().waitForSelector('#dashboard');
	}
}
```

Methods are **static** — they use `page()` internally so you never pass a page instance around.

### 3. Step Definition

```typescript
// tests/step_definitions/LoginSteps.ts

import { Given, When, Then } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';

Given('I am on the login page', async () => {
	await LoginPage.goToLoginPage();
});

When('I log in with valid credentials', async () => {
	await LoginPage.login('user@example.com', 'password');
});

Then('I should see the dashboard', async () => {
	await LoginPage.verifyDashboardVisible();
});
```

---

## Command Reference

| Command                 | When to use                                  |
| ----------------------- | -------------------------------------------- |
| `plum init`             | First-time setup in a new project folder     |
| `plum dev`              | Run all tests locally                        |
| `plum dev @tag`         | Run tests matching a tag locally             |
| `plum dev --parallel N` | Run tests across N parallel workers locally  |
| `plum start`            | Start the full UI stack via Docker           |
| `plum create-step`      | Interactively scaffold a new step definition |

---

## For Contributors

> Only relevant if you're developing Plum itself.

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init        # installs root + backend + frontend dependencies
```

### Backend

```bash
cd backend
npm run init              # set up .env and local test scaffold
npm test                  # run all tests
npm test -- @test-1       # run a specific test by tag
npm test -- --parallel 4  # run tests in parallel
npm run create-step       # generate a step definition interactively
```

### Docker

```bash
npm run docker:up    # build and start all services in detached mode
npm run docker:down  # stop all services
```

---

<p align="center">
  Plum is free to use. If you'd like to show some love:<br/>
  <a href="https://www.paypal.me/silverlunah">PayPal</a> · <a href="https://wise.com/pay/me/janneserjosee">Wise</a>
</p>
