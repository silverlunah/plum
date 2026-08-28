# Do not edit this folder

Everything under `plum-modules/` is regenerated from the installed Plum version before every test run — any change you make here is silently overwritten the next time you run `plum run-test`, `plum node start`, or trigger a run from the web UI.

This is what gives you Plum's session recording (rrweb) and reporting hooks. Use it from your own `tests/utils/browser.ts` and `hooks.ts`:

```ts
import * as plum from './plum-modules/runtime';

export const page = () => plum.page();
export const context = () => plum.context();
export const browser = () => plum.browser();
```

```ts
import * as plum from './plum-modules/runtime';

plum.registerHooks();

// Add your own Before/After/BeforeStep hooks below — Cucumber runs every
// registered hook, so yours run alongside Plum's.
```

If you need something from here that isn't exported, don't copy the file — ask, since it's meant to be extended, not forked.
