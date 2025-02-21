const { SAMPLE_CONSTANT } = require('../utils/constants');
const Utils = require('../utils/utils');

class LoginPage {
	constructor(page) {
		this.page = page;
		this.utils = new Utils(this.page);
	}

	async goToLoginPage() {
		console.log(SAMPLE_CONSTANT);
		await this.utils.goToPage(process.env.BASE_URL);
		await this.page.waitForTimeout(3000);
		throw Error();
	}

	async skipTest() {
		test.skip();
	}
}

module.exports = LoginPage;
