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

const REPORTS_DIR = path.join(__dirname, '../reports');

const getAllReports = () => {
	const files = fs.readdirSync(REPORTS_DIR);

	// Get all files ending with '.html'
	const htmlFiles = files.filter((file) => file.endsWith('.html'));

	// Sort files by modification time (latest first)
	const sortedFiles = htmlFiles.sort((a, b) => {
		const aStats = fs.statSync(path.join(REPORTS_DIR, a));
		const bStats = fs.statSync(path.join(REPORTS_DIR, b));
		return bStats.mtime - aStats.mtime; // Sort in descending order of modification time
	});

	return sortedFiles;
};

const getLatestReport = () => {
	const reportFiles = getAllReports()
		.map((file) => ({
			file,
			time: fs.statSync(path.join(REPORTS_DIR, file)).mtime.getTime()
		}))
		.sort((a, b) => b.time - a.time);

	return reportFiles.length ? reportFiles[0].file : null;
};

module.exports = { getAllReports, getLatestReport };
