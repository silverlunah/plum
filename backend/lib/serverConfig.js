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

/**
 * Source-of-truth config for the `plum server` flow. `.env` and the generated
 * docker-compose override are derived from this file, so reconfiguring URLs and
 * ports happens in one place.
 *
 * Uses only Node builtins so it can be imported from the published `bin/plum.js`.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = '.plum-server.json';

function defaults() {
	return {
		headless: false,
		backendPort: '3001',
		frontendPort: '5173'
	};
}

function configPath(dir) {
	return path.join(dir, CONFIG_FILENAME);
}

/** Seeds headless from an existing .env so the first-run prompt reflects it. */
function readEnvSeed(dir) {
	try {
		const txt = fs.readFileSync(path.join(dir, '.env'), 'utf8');
		const seed = {};
		const headless = txt.match(/^IS_HEADLESS=(.*)$/m);
		if (headless) seed.headless = headless[1].trim() === 'true';
		return seed;
	} catch {
		return {};
	}
}

function loadServerConfig(dir) {
	const base = { ...defaults(), ...readEnvSeed(dir) };
	try {
		return { ...base, ...JSON.parse(fs.readFileSync(configPath(dir), 'utf8')) };
	} catch {
		return base;
	}
}

function saveServerConfig(dir, cfg) {
	const { headless, backendPort, frontendPort } = cfg;
	fs.writeFileSync(
		configPath(dir),
		JSON.stringify({ headless, backendPort, frontendPort }, null, 2) + '\n',
		'utf8'
	);
}

/** Updates IS_HEADLESS in the root .env, preserving all other entries. */
function writeEnvFile(dir, { headless }) {
	const envPath = path.join(dir, '.env');
	let content = '';
	try {
		content = fs.readFileSync(envPath, 'utf8');
	} catch {}
	const line = `IS_HEADLESS=${headless ? 'true' : 'false'}`;
	if (/^IS_HEADLESS=/m.test(content)) {
		content = content.replace(/^IS_HEADLESS=.*/m, line);
	} else {
		content = content.endsWith('\n') ? content + line + '\n' : content + '\n' + line + '\n';
	}
	fs.writeFileSync(envPath, content, 'utf8');
}

/**
 * Builds docker-compose.override.yml. Containers keep their internal ports
 * (3001/5173); only the host side is remapped. The frontend is told where to
 * reach the backend via VITE_API_URL (read by Vite at dev runtime).
 */
function buildOverrideYaml({ testsAbs, reportsAbs, backendPort, frontendPort }) {
	return (
		[
			'services:',
			'  backend:',
			'    ports:',
			`      - "${backendPort}:3001"`,
			'    volumes:',
			`      - "${reportsAbs}:/app/reports"`,
			`      - "${testsAbs}:/app/tests"`,
			'  frontend:',
			'    ports:',
			`      - "${frontendPort}:5173"`,
			'    environment:',
			`      VITE_API_URL: "http://localhost:${backendPort}"`
		].join('\n') + '\n'
	);
}

module.exports = {
	CONFIG_FILENAME,
	defaults,
	loadServerConfig,
	saveServerConfig,
	writeEnvFile,
	buildOverrideYaml
};
