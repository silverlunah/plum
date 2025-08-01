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
const tag = process.env.TAG;

try {
	const baseCommand = [
		'npx',
		'cross-env',
		'TS_NODE_TRANSPILE_ONLY=true',
		'cucumber-js',
		'tests/features/**/*.feature',
		'--require-module',
		'ts-node/register',
		'--require',
		'tests/step_definitions/**/*.ts',
		'--format',
		'json:reports/cucumber_report.json'
	];

	if (tag) {
		baseCommand.push('--tags', `"${tag}"`);
	}

	const cucumberCommand = baseCommand.join(' ');
	execSync(cucumberCommand, { stdio: 'inherit' });
} catch (error) {
	console.error('Tests failed:', error.message);
} finally {
	try {
		execSync('node config/scripts/generate-report.js', { stdio: 'inherit' });
	} catch (error) {
		console.error('Error running report generation:', error.message);
	}
}
