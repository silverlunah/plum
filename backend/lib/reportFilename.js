/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const fs = require('fs');

const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const SCREENSHOTS_DIR = path.join(REPORTS_DIR, 'screenshots');

/**
 * Reads the transient cucumber_report.json written by the most recent local test run.
 * Returns the raw JSON string, or null if the file is absent or unreadable.
 */
function readCucumberReportFile() {
	try {
		const p = path.join(REPORTS_DIR, 'cucumber_report.json');
		return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
	} catch {
		return null;
	}
}

module.exports = { REPORTS_DIR, SCREENSHOTS_DIR, readCucumberReportFile };
