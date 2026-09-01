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
	// Plum sets PLUM_REPORT_FILE when it starts a run; the JSON written there is
	// what shows up in the Plum UI. Run the command yourself and the variable is
	// unset, so this entry disappears and you just get the list reporter.
	// Add your own reporters here — Plum passes no --reporter flag, which would
	// replace this whole list rather than adding to it.
	reporter: [
		['list'],
		...(process.env.PLUM_REPORT_FILE
			? [['json', { outputFile: process.env.PLUM_REPORT_FILE }] as const]
			: [])
	],
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }
	]
});
