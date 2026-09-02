# Project tests

This folder is mounted into Plum at run time: your team owns it, git-manages it,
and merges new tests straight in.

1. Copy `.env.example` to `.env` and set `BASE_URL` (Plum does this for you on
   `plum project init`; `.env` is gitignored so it never holds secrets in git).
2. Add features under `features/`, page objects under `pages/`, steps under
   `step_definitions/`.
3. `plum server restart` is only needed when `.env` changes, new tests are
   picked up on the next run.
