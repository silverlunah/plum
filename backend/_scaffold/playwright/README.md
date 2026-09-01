# Project tests

This folder is mounted into Plum at run time — your team owns it, git-manages it,
and merges new tests straight in.

1. Copy `.env.example` to `.env` and set `BASE_URL` (Plum does this for you when
   it creates the project; `.env` is gitignored so it never holds secrets in git).
2. Add specs under `specs/`, page objects under `pages/`.
3. Tag tests with `{ tag: '@TC-001' }` — Plum selects tests by tag, passing them
   to `--grep`.
4. Wrap each action in `test.step()`. Plum shows every step as its own row in the
   report; a test without them is reported as a single pass or fail.

The example suite covers the four shapes you are likely to need: a basic test, a
negative test, a parameterised one (the equivalent of a Scenario Outline, one test
per row) and one driven by structured data (the equivalent of a data table).

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

Plum always passes `--project=<browser>` so a run reports one browser, and
`--retries` from the project's max-retries setting. Everything else — workers,
timeouts, traces, reporters — comes from `playwright.config.ts`.
