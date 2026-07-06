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

import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

let _browser: Browser;
let _context: BrowserContext;
let _page: Page;
let _ssCounter = 0;

export const page = (): Page => _page;

export async function setup(): Promise<void> {
	const isHeadless = process.env.IS_HEADLESS?.toLowerCase() !== 'false';
	const browserName = (process.env.BROWSER || 'chromium').toLowerCase();
	const browserType =
		browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
	_browser = await browserType.launch({ headless: isHeadless });
	_context = await _browser.newContext();
	_page = await _context.newPage();
}

export async function screenshotStep(
	attach: (data: Buffer, mime: string) => Promise<void>
): Promise<void> {
	if (!_page) return;
	try {
		const screenshot = await _page.screenshot({ type: 'png' });
		await attach(screenshot, 'image/png');
	} catch {
		// page may be navigating or already closed
	}
}

export async function streamLiveScreenshot(stepName: string): Promise<void> {
	const ssDir = process.env.PLUM_SS_DIR;
	if (!ssDir || !_page) return;
	try {
		const seq = `${String(Date.now()).padStart(16, '0')}-${String(++_ssCounter).padStart(4, '0')}`;
		const screenshot = await _page.screenshot({ type: 'jpeg', quality: 70 });
		fs.writeFileSync(
			path.join(ssDir, `${seq}.ss.json`),
			JSON.stringify({ stepName, data: screenshot.toString('base64') })
		);
	} catch {
		// ignore — live streaming is best-effort
	}
}

export async function teardown(
	attach: (data: Buffer, mime: string) => Promise<void>,
	failed: boolean
): Promise<void> {
	if (failed && _page) {
		const screenshotDir = 'reports/screenshots';
		if (!fs.existsSync(screenshotDir)) {
			fs.mkdirSync(screenshotDir, { recursive: true });
		}
		const screenshotPath = path.join(screenshotDir, `screenshot_${Date.now()}.png`);
		await _page.screenshot({ path: screenshotPath });
		const screenshotData = fs.readFileSync(screenshotPath);
		await attach(screenshotData, 'image/png');
		fs.unlinkSync(screenshotPath);
	}
	await _browser?.close();
}
