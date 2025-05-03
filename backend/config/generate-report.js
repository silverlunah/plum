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

const reporter = require('cucumber-html-reporter');
const fs = require('fs');
const path = require('path');
const { reportsHistory } = require('../config/settings.json');

/* -----------------------------------------------------
 *            Screenshot and Report Management
 *
 *  Description:
 * 		To avoid reports and screenshots extract
 *  	status, tags, run name, and date.
 * ------------------------------------------------------ */

const reportsDir = 'reports';
const screenshotsDir = path.join(reportsDir, 'screenshots');
const maxReports = reportsHistory;

// Ensure the reports and screenshots directories exist
if (!fs.existsSync(reportsDir)) {
	fs.mkdirSync(reportsDir, { recursive: true });
}

if (!fs.existsSync(screenshotsDir)) {
	fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Remove the oldest report depending on maxReport
const existingReports = fs
	.readdirSync(reportsDir)
	.filter((file) => file.startsWith('PASS_') || file.startsWith('FAIL_'))
	.sort(
		(a, b) =>
			fs.statSync(path.join(reportsDir, b)).mtime - fs.statSync(path.join(reportsDir, a)).mtime
	);

while (existingReports.length >= maxReports) {
	const oldestReport = existingReports.pop();
	fs.unlinkSync(path.join(reportsDir, oldestReport));
}

// Remove the oldest screenshot depending on maxReport
const existingScreenshots = fs
	.readdirSync(screenshotsDir)
	.filter((file) => file.endsWith('.png') || file.endsWith('.jpg'))
	.sort(
		(a, b) =>
			fs.statSync(path.join(screenshotsDir, b)).mtime -
			fs.statSync(path.join(screenshotsDir, a)).mtime
	);

while (existingScreenshots.length >= maxReports) {
	const oldestScreenshot = existingScreenshots.pop();
	fs.unlinkSync(path.join(screenshotsDir, oldestScreenshot));
}

/* -----------------------------------------------------
 *               Generate the report name
 *
 *  Description:
 * 		This is where the reports page will
 *  	extract status, tags, run name, and date.
 * ------------------------------------------------------ */

const jsonReportFile = path.join(reportsDir, 'cucumber_report.json');
let status = 'PASS';

if (fs.existsSync(jsonReportFile)) {
	const reportData = fs.readFileSync(jsonReportFile, 'utf8');

	// Ensure the JSON is not empty
	if (reportData) {
		const parsedData = JSON.parse(reportData);

		const hasFailures = parsedData.some((feature) =>
			feature.elements.some((scenario) =>
				scenario.steps.some((step) => step.result.status === 'failed')
			)
		);

		if (hasFailures) {
			status = 'FAIL';
		}
	} else {
		console.log('Report file is empty or malformed');
	}
}

let tag = process.env.TAG;

if (!tag) {
	tag = '(@all-tests)';
}

if (tag && !tag.startsWith('(') && !tag.endsWith(')')) {
	tag = `(${tag})`;
}

const timestamp = new Date().toISOString().replace(/[-:.]/g, '_');
const reportFileName = `${status}_cucumber_report_${process.env.TRIGGER}_${tag}_${timestamp}.html`;

const options = {
	theme: 'bootstrap',
	jsonFile: jsonReportFile,
	output: path.join(reportsDir, reportFileName),
	reportSuiteAsScenarios: true,
	launchReport: true, // Automatically opens the report in a browser
	metadata: {
		'App Name': 'Plum',
		'Test Environment': 'Local',
		Browser: 'Chromium',
		Platform: 'Ubuntu',
		Parallel: 'Scenarios',
		Executed: 'Local'
	}
};

reporter.generate(options);
console.log(`Generated report: ${reportFileName}`);
