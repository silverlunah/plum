# Project tests

This folder is mounted into Plum at run time — your team owns it, git-manages it,
and merges new tests straight in.

1. Copy `.env.example` to `.env` and set `BASE_URL` (Plum does this for you when
   it creates the project; `.env` is gitignored so it never holds secrets in git).
2. Add specs under `specs/`, page objects under `pages/`.
3. Tag tests with `{ tag: '@TC-001' }` — Plum selects tests by tag, passing them
   to `--grep`.

`playwright.config.ts` is yours. Browser, retries, workers, timeouts, reporters
and traces are all read from it, by Plum and by you alike:

```
npx playwright test                     # everything
npx playwright test --grep @TC-001      # one test, the way Plum runs it
npx playwright test --ui                # Playwright's UI mode
```
