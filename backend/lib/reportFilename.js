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
