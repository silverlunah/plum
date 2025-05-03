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

const { execSync } = require('child_process');
const tag = process.env.TAG; // Read the TAG environment variable

try {
	// Run the tests with the tag filter, only if a tag is provided
	const cucumberCommand = tag
		? `cucumber-js tests/features/**/*.feature --format json:reports/cucumber_report.json --tags "${tag}"`
		: `cucumber-js tests/features/**/*.feature --format json:reports/cucumber_report.json`;

	execSync(cucumberCommand, { stdio: 'inherit' });
} catch (error) {
	// Log the error to the console if tests fail
	console.error('Tests failed:', error.message);
} finally {
	// Always run the report generation after tests (even if they fail)
	try {
		execSync('node config/generate-report.js', { stdio: 'inherit' });
	} catch (error) {
		console.error('Error running report generation:', error.message);
	}
}
