import { setWorldConstructor, World } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from 'playwright';
import { SessionRecorder } from './recorder';

// Cucumber's per-scenario state. Every step runs with `this` bound to a fresh
// one, so `this.page` is that scenario's own page and nothing is shared with
// scenarios running alongside it.
//
// The four below are Plum's: the Before hook in hooks.ts fills them in and
// reads them back, so leaving them alone keeps replay working. Add your own
// state next to them: a signed-in user, an API client, an id one step hands to
// the next.
export class PlumWorld extends World {
	browser!: Browser;
	context!: BrowserContext;
	page!: Page;
	recorder!: SessionRecorder;
}

setWorldConstructor(PlumWorld);
