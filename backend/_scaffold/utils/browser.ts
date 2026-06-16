import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';

let _browser: Browser;
let _context: BrowserContext;
let _page: Page;

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

export async function teardown(
	attach: (data: Buffer, mime: string) => Promise<void>,
	failed: boolean
): Promise<void> {
	if (failed && _page) {
		const screenshotDir = 'reports/screenshots';
		const fs = await import('fs');
		const path = await import('path');
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
