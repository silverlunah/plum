import { Page, expect } from '@playwright/test';

export class LoginPage {
	constructor(private readonly page: Page) {}

	async goto() {
		await this.page.goto('/');
	}

	async login(username: string, password: string) {
		await this.page.fill('#user-name', username);
		await this.page.fill('#password', password);
		await this.page.click('#login-button');
	}

	async expectSignedIn() {
		await expect(this.page.locator('.title')).toBeVisible();
	}

	async expectRejected() {
		await expect(this.page.locator('.error-message-container')).toBeVisible();
	}
}
