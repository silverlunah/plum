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

const fs = require('fs');
const path = require('path');
const { normaliseTrigger } = require('../../constants/triggers');
const { REPORTS_DIR } = require('../../lib/reportFilename');

const jsonReportFile = path.join(REPORTS_DIR, 'cucumber_report.json');

if (!fs.existsSync(jsonReportFile)) {
	console.log('No cucumber_report.json found — skipping report save.');
	process.exit(0);
}

// Remote runner nodes (PLUM_MODE=node) have no DB access.
// The primary server reads cucumber_report.json via readCucumberReportFile()
// and saves the combined report after all lanes finish.
if (process.env.PLUM_MODE === 'node') process.exit(0);

// `run-test` runs on the host without Docker/Postgres, so DATABASE_URL is
// never set there — skip the DB save instead of letting Prisma's connection
// attempt surface as an unhandled-looking stack trace after tests already ran.
if (!process.env.DATABASE_URL) {
	console.log('No DATABASE_URL configured — skipping report save to database.');
	process.exit(0);
}

(async () => {
	try {
		const raw = JSON.parse(fs.readFileSync(jsonReportFile, 'utf8'));
		const reportService = require('../../services/reportService');
		const triggerType = normaliseTrigger(process.env.TRIGGER);
		const rawTag = process.env.TAG || '@all-tests';
		const nodeCount = Math.max(
			1,
			parseInt(process.env.REPORT_RUNNERS || process.env.PARALLEL || '1', 10) || 1
		);

		const saved = await reportService.saveReport({
			rawCucumberJson: raw,
			tags: rawTag,
			triggerType,
			nodeCount,
			browser: process.env.BROWSER || 'chromium',
			runnerName: process.env.RUNNER_NAME || null,
			runnerId: process.env.RUNNER_ID || null,
			testRunId: process.env.TEST_RUN_ID || null
		});

		console.log(`Report saved to database (id: ${saved.id})`);
	} catch (e) {
		console.error('Could not save report to database:', e.message);
	}
})();
