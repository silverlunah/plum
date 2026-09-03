import { page } from './browser';

export class Utils {
	static async goToPage(url: string) {
		await page().goto(url);
	}
}
