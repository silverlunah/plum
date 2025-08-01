// loginPage.ts
import test, { Page } from '@playwright/test';
import { SAMPLE_CONSTANT } from '../utils/constants';
import { Utils } from '../utils/utils';

export class LoginPage {
	private page: Page;
	private utils: Utils;

	constructor(page: Page) {
		this.page = page;
		this.utils = new Utils(this.page);
	}

	async goToLoginPage() {
		console.log(SAMPLE_CONSTANT);
		await this.utils.goToPage(process.env.BASE_URL as string);
		await this.page.waitForTimeout(3000);
	}

	async skipTest() {
		test.skip();
	}
}
