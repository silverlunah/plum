class Utils {
	constructor(page) {
		this.page = page;
	}
	async goToPage(url) {
		await this.page.goto(url);
	}
}

module.exports = Utils;
