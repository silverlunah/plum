# Project tests

This folder is yours: git-manage it and merge new tests straight in. Plum mounts it at run time.

1. Copy `.env.example` to `.env` and set `BASE_URL`. Plum does this when it creates the project, and `.env` is gitignored.
2. Add specs under `specs/`, page objects under `pages/`.
3. Give every test its own tag, `{ tag: '@TC-001' }`, including each row of a parameterised set. Tags are ids: two tests sharing one cannot be told apart in a report or matched to separate cases in the repository.
4. Wrap each action in `test.step` so the report shows it as its own row. A test without them reports as a single pass or fail.

## Imports

Take `test` from the fixtures, not from `@playwright/test`, because that is what records the session for report replay. It is the only import that changes: `expect`, `Page`, `Locator` and everything else come from `@playwright/test` as usual, and you never edit a fixture to use a new Playwright API.

```ts
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/pages';
```

`fixtures/plum.ts` is Plum's, leave it alone. `fixtures/pages.ts` is yours: it extends Plum's `test` with one fixture per page object, so each spec gets the pages it needs and no test shares state.

```ts
test('...', async ({ login }) => {
	await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
});
```

## Running

`playwright.config.ts` is yours. Browsers, timeouts, traces and reporters all come from it, for Plum and for you alike.

```
npx playwright test                        # everything, in both browsers
npx playwright test --project=chromium     # one browser, the way Plum runs it
npx playwright test --grep @TC-001         # one test, the way Plum runs it
npx playwright test --ui                   # Playwright's UI mode
```

Plum passes the selection (`--grep`, plus `--shard` when a run is split across nodes), `--project` so a run reports one browser, `--retries` from the project's max-retries setting, and `--workers` from the worker count you pick. Nothing else is overridden.

Workers help only if the work can be split. Playwright divides it between files, so one spec file would use one worker however many you ask for; `fullyParallel: true` in the config spreads the tests inside a file too, and is already set. Tests therefore run in any order in separate browsers, so they must not depend on one another.
