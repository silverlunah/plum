import { Page } from '@playwright/test';

export class Utils {
	private page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goToPage(url: string) {
		await this.page.goto(url);
	}
}
