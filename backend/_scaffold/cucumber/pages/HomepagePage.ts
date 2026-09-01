import { page } from '../utils/browser';

export class HomepagePage {
	static async iShouldBeNavigatedToTheProductsPage() {
		await page().waitForSelector('.title');
	}
}
