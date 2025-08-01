import { Before, After, setWorldConstructor, ITestCaseHookParameter } from '@cucumber/cucumber';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { CustomWorld } from './world';
import dotenv from 'dotenv';

dotenv.config();
setWorldConstructor(CustomWorld);

Before(async function (this: CustomWorld) {
	const isHeadless = process.env.IS_HEADLESS?.toLowerCase() !== 'false';

	this.browser = await chromium.launch({ headless: isHeadless });
	this.context = await this.browser.newContext();
	this.page = await this.context.newPage();

	this.initPages(this.page);
});

After(async function (this: CustomWorld, scenario: ITestCaseHookParameter) {
	if (scenario.result?.status === 'FAILED' && this.page) {
		const screenshotDir = path.join('reports', 'screenshots');
		if (!fs.existsSync(screenshotDir)) {
			fs.mkdirSync(screenshotDir, { recursive: true });
		}

		const screenshotPath = path.join(screenshotDir, `screenshot_${Date.now()}.png`);
		await this.page.screenshot({ path: screenshotPath });

		const screenshotData = fs.readFileSync(screenshotPath);
		await this.attach(screenshotData, 'image/png');
	}

	await this.browser?.close();
});
