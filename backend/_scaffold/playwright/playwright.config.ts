import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// Yours to change. Plum only chooses which tests to run and where the report goes,
// so `npx playwright test` from this folder behaves the same way a Plum run does.
export default defineConfig({
	testDir: './specs',
	use: {
		baseURL: process.env.BASE_URL,
		// Server and node runs are always headless. IS_HEADLESS=false in .env lets you
		// watch the browser on runs you start yourself.
		headless: process.env.IS_HEADLESS !== 'false',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	// Plum passes --retries and --workers from the project's settings, overriding these.
	retries: 0,
	// Keep the json entry: it is how a run reaches the Plum UI. Add your own
	// reporters alongside it.
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
