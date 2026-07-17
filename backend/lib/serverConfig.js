/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
		frontendPort: '5173',
		// Public URLs the browser actually uses. Left blank until the user sets
		// them (e.g. behind a reverse proxy) — resolved to a localhost default
		// at the call site otherwise.
		apiUrl: '',
		uiUrl: ''
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
	const { headless, backendPort, frontendPort, apiUrl, uiUrl } = cfg;
	fs.writeFileSync(
		configPath(dir),
		JSON.stringify({ headless, backendPort, frontendPort, apiUrl, uiUrl }, null, 2) + '\n',
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
 * Builds docker-compose.override.yml. Host port remapping is handled by
 * BACKEND_PORT/FRONTEND_PORT env vars read by docker-compose.yml itself
 * (${BACKEND_PORT:-3001} etc) — NOT here, because Compose merges `ports:`
 * lists across files by concatenation rather than replacing them. Defining
 * ports in both the base file and this override would publish both values
 * simultaneously, and fail to start if the base file's default port happens
 * to already be taken. This override only adds volumes and tells the
 * frontend where to reach the backend via VITE_API_URL.
 */
function buildOverrideYaml({ testsAbs, reportsAbs, backendPort, apiUrl }) {
	return (
		[
			'services:',
			'  backend:',
			'    volumes:',
			`      - "${reportsAbs}:/app/reports"`,
			`      - "${testsAbs}:/app/tests"`,
			'  frontend:',
			'    environment:',
			`      VITE_API_URL: "${apiUrl || `http://localhost:${backendPort}`}"`
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
