import { page } from '../utils/browser';

export class ShowcasePage {
	static async goToLoginPage() {
		await page().goto(process.env.BASE_URL as string);
	}

	static async loginWith(username: string, password: string) {
		await page().fill('#user-name', username);
		await page().fill('#password', password);
		await page().click('#login-button');
	}

	static async fillLoginForm(fields: { field: string; value: string }[]) {
		for (const { field, value } of fields) {
			if (field === 'username') await page().fill('#user-name', value);
			if (field === 'password') await page().fill('#password', value);
		}
		await page().click('#login-button');
	}

	static async verifyProductsPage() {
		await page().waitForSelector('.title');
	}

	static async verifyLoginOutcome(outcome: string) {
		if (outcome === 'success') {
			await page().waitForSelector('.title');
		} else {
			await page().waitForSelector('.error-message-container');
		}
	}

	static async receiveNote(note: string) {
		console.log('[Doc String received]:\n', note);
	}
}
