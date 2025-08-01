import { Page } from '@playwright/test';

export class Utils {
	private page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goToPage(url: string) {
		try {
			await this.page.goto(url);

			console.log('test');
		} catch (error) {
			console.log(error);
		}
	}
}
