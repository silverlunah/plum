import { Page, expect } from '@playwright/test';

export class HomepagePage {
	constructor(private readonly page: Page) {}

	async iShouldBeNavigatedToTheProductsPage() {
		await expect(this.page.locator('.title')).toBeVisible();
	}
}
