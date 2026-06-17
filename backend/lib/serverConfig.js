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
const { detectLanIp } = require('./nodeRegister');

const CONFIG_FILENAME = '.plum-server.json';

function defaults() {
	const backendPort = '3001';
	return {
		baseUrl: 'https://www.saucedemo.com/v1/',
		headless: false,
		backendPort,
		frontendPort: '5173',
		primaryPublicUrl: `http://${detectLanIp()}:${backendPort}`
	};
}

function configPath(dir) {
	return path.join(dir, CONFIG_FILENAME);
}

/** Seeds baseUrl/headless from an existing .env so first-run prompts reflect it. */
function readEnvSeed(dir) {
	try {
		const txt = fs.readFileSync(path.join(dir, '.env'), 'utf8');
		const seed = {};
		const baseUrl = txt.match(/^BASE_URL=(.*)$/m);
		if (baseUrl) seed.baseUrl = baseUrl[1].trim();
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
	fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/** Writes the root .env consumed by the backend/tests from the server config. */
function writeEnvFile(dir, { baseUrl, headless }) {
	const content = `BASE_URL=${baseUrl}\nIS_HEADLESS=${headless ? 'true' : 'false'}\n`;
	fs.writeFileSync(path.join(dir, '.env'), content, 'utf8');
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
