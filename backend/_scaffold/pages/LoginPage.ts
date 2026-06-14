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

	static async fillLoginForm(fields: { field: string; value: string }[]) {
		for (const { field, value } of fields) {
			if (field === 'username') await page().fill('#user-name', value);
			if (field === 'password') await page().fill('#password', value);
		}
		await page().click('#login-button');
	}

	static async verifyLoginOutcome(outcome: string) {
		if (outcome === 'success') {
			await page().waitForSelector('.title');
		} else {
			await page().waitForSelector('.error-message-container');
		}
	}

	static async verifyLoginFailed() {
		await page().waitForSelector('.error-message-container');
	}
}
