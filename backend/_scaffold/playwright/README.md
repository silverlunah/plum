# Project tests

This folder is mounted into Plum at run time: your team owns it, git-manages it,
and merges new tests straight in.

1. Copy `.env.example` to `.env` and set `BASE_URL` (Plum does this for you when
   it creates the project; `.env` is gitignored so it never holds secrets in git).
2. Add specs under `specs/`, page objects under `pages/`.
3. Tag tests with `{ tag: '@TC-001' }`, Plum selects tests by tag, passing them
   to `--grep`.
4. Take `plumStep` from the fixture and wrap each action in it. Plum shows every
   step as its own row in the report, including steps inside `beforeEach`. A test
   without them is reported as a single pass or fail.

Import `test` from `fixtures/plum` rather than `@playwright/test`, that is what
records the session for report replay. It is the only import that changes:
`expect`, `Page`, `Locator` and everything else come from `@playwright/test` as
usual, whether or not you use page objects, and you never have to edit the fixture
to use a new Playwright API.

```ts
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/plum';
```

`fixtures/plum.ts` is Plum's, leave it as it is. `fixtures/pages.ts` is yours: it
extends Plum's `test` with a fixture per page object, so a spec receives the pages
it needs and no test shares state with another. Add your pages there and import
`test` from `fixtures/pages` instead, as the example suite does.

```ts
import { test } from '../fixtures/pages';

test('...', async ({ login, plumStep }) => {
	await plumStep('I click on the login button', () => login.iClickOnTheLoginButton());
});
```

The example suite covers the four shapes you are likely to need: a basic test, a
negative test, a parameterised one (the equivalent of a Scenario Outline, one test
per row) and one driven by structured data (the equivalent of a data table).

`npm install` in this folder installs the runner and its types (~50 MB; browsers
live in a shared cache, not here). Plum does it before a run, and it is what makes
the folder type-check in your editor.

Give every test its own tag, including each row of a parameterised set. Tags are
ids: two tests sharing one cannot be told apart in a report or matched to separate
cases in the repository.

`playwright.config.ts` is yours. Browser, retries, workers, timeouts, reporters
and traces are all read from it, by Plum and by you alike:

```
npx playwright test                        # everything, in both browsers
npx playwright test --project=chromium     # one browser, the way Plum runs it
npx playwright test --grep @TC-001         # one test, the way Plum runs it
npx playwright test --ui                   # Playwright's UI mode
```

Plum always passes `--project=<browser>` so a run reports one browser,
`--retries` from the project's max-retries setting, and `--workers` from the
worker count you pick. Everything else (timeouts, traces, reporters) comes
from `playwright.config.ts`.

Workers only help if your tests can actually be split. Playwright divides work
between files, so a single spec file runs in one worker no matter how many you
ask for; `test.describe.configure({ mode: 'parallel' })` lets the tests inside
one file spread out too. Tests then run in any order, in separate browsers, so
they must not depend on one another.
