import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// Yours to change. Plum only chooses which tests to run and where the report goes,
// so `npx playwright test` from this folder behaves the same way a Plum run does.
export default defineConfig({
	testDir: './specs',
	// Spreads the tests inside a file across workers. Without it Playwright gives a
	// whole file to one worker, so a worker count above 1 changes nothing for a
	// single spec file. Tests then run in any order in separate browsers, so they
	// must not depend on one another.
	fullyParallel: true,
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
