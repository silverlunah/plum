import { Page, expect } from '@playwright/test';

export class LoginPage {
	constructor(private readonly page: Page) {}

	async goToLoginPage() {
		// Relative: baseURL comes from playwright.config.ts.
		await this.page.goto('/');
	}

	async iEnterUsername(username: string) {
		await this.page.fill('#user-name', username);
	}

	async iEnterPassword(password: string) {
		await this.page.fill('#password', password);
	}

	async iClickOnTheLoginButton() {
		await this.page.click('#login-button');
	}

	async fillLoginForm(fields: { field: string; value: string }[]) {
		for (const { field, value } of fields) {
			if (field === 'username') await this.page.fill('#user-name', value);
			if (field === 'password') await this.page.fill('#password', value);
		}
		await this.page.click('#login-button');
	}

	async verifyLoginOutcome(outcome: string) {
		if (outcome === 'success') {
			await expect(this.page.locator('.title')).toBeVisible();
		} else {
			await expect(this.page.locator('.error-message-container')).toBeVisible();
		}
	}

	async verifyLoginFailed() {
		await expect(this.page.locator('.error-message-container')).toBeVisible();
	}
}
