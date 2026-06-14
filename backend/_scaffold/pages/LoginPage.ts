import test from '@playwright/test';
import { page } from '../utils/browser';
import { SAMPLE_CONSTANT } from '../utils/constants';
import { Utils } from '../utils/utils';

export class LoginPage {
	static async goToLoginPage() {
		console.log(SAMPLE_CONSTANT);
		await Utils.goToPage(process.env.BASE_URL as string);
		await page().waitForTimeout(3000);
	}

	static async skipTest() {
		test.skip();
	}
}
