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
const fs = require('fs');
const path = require('path');
const pc = require('picocolors');

const parallelIdx = process.argv.indexOf('--parallel');
const parallel =
	process.env.PARALLEL || (parallelIdx !== -1 ? process.argv[parallelIdx + 1] : null);
const runners = parallel || process.env.REPORT_RUNNERS || '1';
const tag = process.env.TAG || process.argv.slice(2).find((a) => a.startsWith('@'));
const browser = process.env.BROWSER || 'chromium';

const reportFile = path.resolve(process.cwd(), 'reports', 'cucumber_report.json');

// Wipe any previous report so a crashed/empty run can never return stale results.
try {
	fs.rmSync(reportFile, { force: true });
} catch {}

let testExitCode = 0;

try {
	const testsRoot = (process.env.TESTS_ROOT || 'tests').replace(/\\/g, '/');

	// Dispatched tests run from an external dir (e.g. a temp dir on a node) that has
	// no node_modules of its own — point Node at the backend's modules so imports
	// like 'playwright' and '@cucumber/cucumber' resolve.
	const nodeModulesPath = path.resolve(__dirname, '..', '..', 'node_modules');

	const baseCommand = [
		'npx',
		'cross-env',
		`BROWSER=${browser}`,
		'TS_NODE_TRANSPILE_ONLY=true',
		'cucumber-js',
		`${testsRoot}/features/**/*.feature`,
		'--require-module',
		'ts-node/register',
		'--require',
		`${testsRoot}/utils/hooks.ts`,
		'--require',
		`${testsRoot}/step_definitions/**/*.ts`,
		'--format',
		'json:reports/cucumber_report.json'
	];

	if (tag) {
		baseCommand.push('--tags', `"${tag}"`);
	}

	if (parallel) {
		baseCommand.push('--parallel', parallel);
	}

	const cucumberCommand = baseCommand.join(' ');
	execSync(cucumberCommand, {
		stdio: 'inherit',
		env: {
			...process.env,
			NODE_PATH: process.env.NODE_PATH
				? `${nodeModulesPath}${path.delimiter}${process.env.NODE_PATH}`
				: nodeModulesPath
		}
	});
} catch (error) {
	// Cucumber exits non-zero when scenarios fail — preserve it so callers see the real result.
	testExitCode = error.status ?? 1;
	console.error(pc.red('✗') + ' Tests failed: ' + error.message);
} finally {
	try {
		execSync('node config/scripts/generate-report.js', {
			stdio: 'inherit',
			env: { ...process.env, REPORT_RUNNERS: runners }
		});
	} catch (error) {
		console.error(pc.red('✗') + ' Report generation failed: ' + error.message);
	}
}

process.exit(testExitCode);
