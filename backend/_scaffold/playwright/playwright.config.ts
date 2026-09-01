import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// This file belongs to your project, not to Plum. Plum runs the Playwright CLI
// and passes only which tests to run (--grep / --shard) and where to write the
// report — everything below is yours to change, and `npx playwright test` from
// this folder behaves exactly the same way Plum does.
export default defineConfig({
	testDir: './specs',
	// Plum's server and node runs are always headless; there is no display in a
	// container. Locally, IS_HEADLESS=false in .env lets you watch the browser.
	use: {
		baseURL: process.env.BASE_URL,
		headless: process.env.IS_HEADLESS !== 'false',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	// Retries and workers are read from here, not from Plum's UI. A retried test
	// that eventually passes is reported as flaky rather than failed.
	retries: 1,
	workers: process.env.CI ? 2 : undefined,
	reporter: [['list']],
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }
	]
});
