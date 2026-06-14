![alt-text="social-preview"](https://repository-images.githubusercontent.com/936477779/e928fce3-6d4c-4609-92a0-0a1091c99752)

<p align="center">
  📖 <a href="https://github.com/silverlunah/plum/wiki">Wiki</a> |
  📦 <a href="https://www.npmjs.com/package/plum-e2e">npm</a>
</p>

## Welcome to Plum!

Plum is a ready-to-use E2E test automation environment that combines [Playwright](https://playwright.dev) and [Cucumber](https://cucumber.io). Write tests in [Gherkin](https://cucumber.io/docs/gherkin/) format, run them from the CLI or through a UI, and view reports — all in one place.

---

## For Users

> People who want to use Plum as a test environment for their website.

### Prerequisites

- [Node.js](https://nodejs.org)
- [Docker](https://www.docker.com) (required for `plum start`)

### Setup

```bash
npm install -g plum-e2e
mkdir my-tests && cd my-tests
plum init
```

`plum init` creates the following in your project directory and installs the [Cucumber VS Code extension](https://marketplace.visualstudio.com/items?itemName=cucumberopen.cucumber-official) for step definition linking:

<pre>
╠═ tests
║  ╠═ features           : Gherkin feature files — your test cases
║  ╠═ step_definitions   : TypeScript step implementations
║  ╠═ pages              : Page Object Models
║  ╚═ utils              : Shared utilities (browser setup, constants, etc.)
╠═ .vscode
║  ╚═ settings.json      : Cucumber extension config (step definition linking)
╚═ .env                  : Environment config (BASE_URL, IS_HEADLESS)
</pre>

### Commands

| Command | Description |
|---|---|
| `plum init` | Scaffold the `tests/` folder and `.env` file in your project directory |
| `plum dev [tag]` | Run tests locally without Docker. Pass a tag to filter (e.g. `@test-1`) |
| `plum start` | Start the full stack via Docker and open the UI at `http://localhost:5173` |
| `plum create-step` | Interactive prompt to generate a step definition and page object |

---

### Writing a Test

Tests follow a three-layer structure: **Feature → Step Definition → Page Object**.

#### 1. Feature File

Create a `.feature` file in `tests/features/`. Tags are used to filter which tests to run.

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

#### 2. Page Object Model

Create a `.ts` file in `tests/pages/`. Methods are **static** — they use `page()` internally so you never need to pass a page instance around.

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

#### 3. Step Definition

Create a `.ts` file in `tests/step_definitions/`. Just import the page and call its static methods directly.

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

#### Running your test

```bash
plum dev @test-login-1   # run a single scenario
plum dev @suite-login    # run the whole suite
plum dev                 # run all tests
```

---

## For Developers

> People who want to contribute to or develop Plum itself.

### Setup

```bash
git clone https://github.com/silverlunah/plum.git
cd plum
npm run init
```

`npm run init` installs all dependencies across the root, backend, and frontend.

### Backend Local Commands

Run these from the `backend/` directory:

| Command | Description |
|---|---|
| `npm run init` | Create `.env` and copy scaffold into `backend/tests/` |
| `npm run dev [-- tag]` | Run tests from `backend/tests/` directly |
| `npm run create-step` | Interactive prompt to generate a step definition and page object |

```bash
cd backend
npm run init               # sets up .env and tests/ for local development
npm run dev                # run all tests
npm run dev -- @test-1     # run a specific test by tag
npm run create-step        # generate a new step and page interactively
```

### Docker

```bash
npm run docker:up    # build and start all services
npm run docker:down  # stop all services
```

---

## Other

Plum is completely free to use! But if you want to share some love, here's my [PayPal](https://www.paypal.me/silverlunah) or [Wise](https://wise.com/pay/me/janneserjosee)
