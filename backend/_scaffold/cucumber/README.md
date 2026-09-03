# Project tests

This folder is yours: git-manage it and merge new tests straight in. Plum mounts it at run time.

1. Copy `.env.example` to `.env` and set `BASE_URL`. Plum does this for you on `plum project init`, and `.env` is gitignored.
2. Add features under `features/`, steps under `step_definitions/`, page objects under `pages/`.
3. Give every scenario its own tag, `@TC-001`. Tags are ids: two scenarios sharing one cannot be told apart in a report or matched to separate cases in the repository. A `Scenario Outline` shares its tag across all its rows.
4. `utils/world.ts` is the World, Cucumber's per-scenario state. Steps get it as `this`, so `this.page` is that scenario's own page. Add your own state to it.
5. `utils/hooks.ts` and `utils/recorder.ts` open the browser and record the session for report replay. Leave them as they are; add your own `Before`/`After` hooks below the marked line in `hooks.ts`.

Write steps with `function`, not an arrow, or there is no `this`:

```ts
import { When } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';
import { PlumWorld } from '../utils/world';

When('I click on the login button', async function (this: PlumWorld) {
	await new LoginPage(this.page).iClickOnTheLoginButton();
});
```

`BASE_URL` is set as the context's `baseURL`, so a page object navigates with a relative path: `this.page.goto('/')`.

New tests are picked up on the next run. `plum server restart` is only needed when `.env` changes.

## Running

`cucumber.js` is yours: paths, requires and formatters all come from it.

```
npx cucumber-js                            # everything
npx cucumber-js --tags @TC-001             # one scenario, the way Plum runs it
npx cucumber-js --tags '@TS-001 and not @wip'
npx cucumber-js --parallel 4               # four workers
BROWSER=firefox npx cucumber-js            # chromium (default) or firefox
```

Plum passes `--tags` for the selection and `--parallel` for the worker count you pick. Parallel scenarios run in any order in separate browsers, so they must not depend on one another.
