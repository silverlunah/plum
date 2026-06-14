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
const { reportsHistory } = require('../settings.json');

const reportsDir = 'reports';
const screenshotsDir = path.join(reportsDir, 'screenshots');
const maxReports = reportsHistory;

if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

// Clean up old timestamped report JSON files
const existingReports = fs
	.readdirSync(reportsDir)
	.filter((f) => f.endsWith('.json') && (f.startsWith('PASS_') || f.startsWith('FAIL_')))
	.sort(
		(a, b) =>
			fs.statSync(path.join(reportsDir, b)).mtime - fs.statSync(path.join(reportsDir, a)).mtime
	);

while (existingReports.length >= maxReports) {
	fs.unlinkSync(path.join(reportsDir, existingReports.pop()));
}

// Clean up old screenshots
const existingScreenshots = fs
	.readdirSync(screenshotsDir)
	.filter((f) => f.endsWith('.png') || f.endsWith('.jpg'))
	.sort(
		(a, b) =>
			fs.statSync(path.join(screenshotsDir, b)).mtime -
			fs.statSync(path.join(screenshotsDir, a)).mtime
	);

while (existingScreenshots.length >= maxReports) {
	fs.unlinkSync(path.join(screenshotsDir, existingScreenshots.pop()));
}

// Determine PASS/FAIL from cucumber JSON output
const jsonReportFile = path.join(reportsDir, 'cucumber_report.json');
let status = 'PASS';

if (fs.existsSync(jsonReportFile)) {
	try {
		const parsedData = JSON.parse(fs.readFileSync(jsonReportFile, 'utf8'));
		const hasFailures = parsedData.some((feature) =>
			feature.elements?.some((scenario) =>
				scenario.steps?.some((step) => step.result?.status === 'failed')
			)
		);
		if (hasFailures) status = 'FAIL';
	} catch (e) {
		console.error('Could not parse cucumber_report.json:', e.message);
	}
} else {
	console.log('No cucumber_report.json found.');
}

// Build filename with same convention as before, now .json
let tag = process.env.TAG || '(@all-tests)';
if (tag && !tag.startsWith('(')) tag = `(${tag})`;

const timestamp = new Date().toISOString().replace(/[-:.]/g, '_');
const runners = Number.parseInt(process.env.REPORT_RUNNERS || process.env.PARALLEL || '1', 10);
const runnerCount = Number.isFinite(runners) && runners > 0 ? runners : 1;
const reportFileName = `${status}_cucumber_report_${process.env.TRIGGER}_${tag}_runners_${runnerCount}_${timestamp}.json`;

// Save a timestamped snapshot of the cucumber JSON
if (fs.existsSync(jsonReportFile)) {
	fs.copyFileSync(jsonReportFile, path.join(reportsDir, reportFileName));
	console.log(`Report saved: ${reportFileName}`);

	// Persist metadata to database
	(async () => {
		try {
			const { PrismaClient } = require('@prisma/client');
			const prisma = new PrismaClient();

			const triggerType = process.env.TRIGGER || 'command-line-trigger';
			const builtInTriggers = ['manual-trigger', 'command-line-trigger', 'undefined'];
			let cronJobId = null;

			if (!builtInTriggers.includes(triggerType)) {
				const job = await prisma.cronJob.findUnique({ where: { taskName: triggerType } });
				if (job) cronJobId = job.id;
			}

			const rawTag = process.env.TAG || '@all-tests';
			const tags = rawTag.replace(/^\(|\)$/g, '');

			await prisma.report.upsert({
				where: { fileName: reportFileName },
				create: {
					fileName: reportFileName,
					status,
					tags,
					triggerType,
					runners: runnerCount,
					cronJobId
				},
				update: {}
			});

			await prisma.$disconnect();
			console.log('Report metadata saved to database.');
		} catch (e) {
			console.error('Could not save report metadata to DB:', e.message);
		}
	})();
} else {
	console.log('Skipping report save — no cucumber_report.json.');
}
