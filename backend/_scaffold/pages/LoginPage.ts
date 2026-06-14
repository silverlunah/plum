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

	static async iEnterUsername(username: string) {
		await page().fill('#user-name', username);
	}

	static async iEnterPassword(password: string) {
		await page().fill('#password', password);
	}

	static async iClickOnTheLoginButton() {
		await page().click('#login-button');
	}
}
