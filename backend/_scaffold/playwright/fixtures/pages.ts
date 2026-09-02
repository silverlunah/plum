// Yours: one fixture per page object, so a spec takes the pages it needs from the
// test callback instead of sharing mutable state across tests. Add to this file
// as you add page objects, and import `test` from here in your specs.

import { test as base } from './plum';
import { LoginPage } from '../pages/LoginPage';
import { HomepagePage } from '../pages/HomepagePage';

export const test = base.extend<{
	login: LoginPage;
	homepage: HomepagePage;
}>({
	login: async ({ page }, use) => {
		await use(new LoginPage(page));
	},

	homepage: async ({ page }, use) => {
		await use(new HomepagePage(page));
	}
});

export { expect } from '@playwright/test';
