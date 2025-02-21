/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

require('dotenv').config();

const { Before, After, setWorldConstructor } = require('@cucumber/cucumber');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const Utils = require('../utils/utils');
const LoginPage = require('../pages/LoginPage');

class CustomWorld {
	constructor({ attach }) {
		// Enable attaching files to reports
		this.attach = attach;

		// Instance
		this.browser = null;
		this.context = null;
		this.page = null;

		// Pages
		this.loginPage = null;
		this.utils = null;
	}
}

setWorldConstructor(CustomWorld);

Before(async function () {
	this.browser = await chromium.launch({ headless: process.env.IS_HEADLESS === 'true' });
	this.context = await this.browser.newContext();
	this.page = await this.context.newPage();
	this.loginPage = new LoginPage(this.page);
	this.utils = new Utils(this.page);
});

After(async function (scenario) {
	if (scenario.result.status === 'FAILED') {
		const screenshotPath = path.join('reports/screenshots', `screenshot_${Date.now()}.png`);
		await this.page.screenshot({ path: screenshotPath });

		// Attach screenshot to the Cucumber report
		const screenshotData = fs.readFileSync(screenshotPath);
		this.attach(screenshotData, 'image/png');
	}

	// Close the browser after each test
	await this.browser.close();
});
