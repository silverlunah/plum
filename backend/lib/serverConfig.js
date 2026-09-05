/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Source-of-truth config for the `plum server` flow. `.env` and the generated
 * docker-compose override are derived from this file, so reconfiguring URLs and
 * ports happens in one place.
 *
 * Pulls in nothing outside Node builtins and our own constants, so it can be
 * imported from the published `bin/plum.js`.
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_FRAMEWORK } = require('../constants/defaults');

const CONFIG_FILENAME = '.plum-server.json';

function defaults() {
	return {
		// Default test framework for projects created on this server. A project's
		// own choice is fixed at creation and never re-read from here.
		framework: DEFAULT_FRAMEWORK,
		backendPort: '3001',
		frontendPort: '3002',
		// Public URLs the browser actually uses. Left blank until the user sets
		// them (e.g. behind a reverse proxy): resolved to a localhost default
		// at the call site otherwise.
		apiUrl: '',
		uiUrl: ''
	};
}

function configPath(dir) {
	return path.join(dir, CONFIG_FILENAME);
}

function loadServerConfig(dir) {
	try {
		return { ...defaults(), ...JSON.parse(fs.readFileSync(configPath(dir), 'utf8')) };
	} catch {
		return defaults();
	}
}

function saveServerConfig(dir, cfg) {
	const { framework, backendPort, frontendPort, apiUrl, uiUrl } = cfg;
	fs.writeFileSync(
		configPath(dir),
		JSON.stringify({ framework, backendPort, frontendPort, apiUrl, uiUrl }, null, 2) + '\n',
		'utf8'
	);
}

// Ensures IS_HEADLESS=false in the root .env so a local `npx playwright test` or
// `npx cucumber-js` run is headed, keeping every other entry. Server and node
// runs force headless regardless of this.
function writeEnvFile(dir) {
	const envPath = path.join(dir, '.env');
	let content = '';
	try {
		content = fs.readFileSync(envPath, 'utf8');
	} catch {}
	if (/^IS_HEADLESS=/m.test(content)) return;
	content = content && !content.endsWith('\n') ? content + '\n' : content;
	fs.writeFileSync(envPath, content + 'IS_HEADLESS=false\n', 'utf8');
}

/**
 * Builds docker-compose.override.yml. Host port remapping is handled by
 * BACKEND_PORT/FRONTEND_PORT env vars read by docker-compose.yml itself
 * (${BACKEND_PORT:-3001} etc), NOT here, because Compose merges `ports:`
 * lists across files by concatenation rather than replacing them. Defining
 * ports in both the base file and this override would publish both values
 * simultaneously, and fail to start if the base file's default port happens
 * to already be taken. This override only adds volumes and tells the
 * frontend where to reach the backend via VITE_API_URL.
 */
// The whole ./projects tree is mounted at /app/projects, the backend owns every
// projects/<slug>/tests/ folder (creating them on project creation), so there's
// nothing per-project to wire here. The legacy single `tests/` mount is added
// only when that folder exists (a single-project install predating
// multi-project): a fresh install has none.
function buildOverrideYaml({
	testsAbs,
	dataAbs,
	projectsAbs,
	backendPort,
	apiUrl,
	uiUrl,
	plumVersion,
	framework
}) {
	return (
		[
			'services:',
			'  backend:',
			'    environment:',
			`      PLUM_VERSION: "${plumVersion || ''}"`,
			// Which framework the project-create form should pre-select. The config file
			// itself lives on the host, outside the container.
			`      PLUM_DEFAULT_FRAMEWORK: "${framework || ''}"`,
			// Already collected here, so notification report links don't ask again in
			// Settings → Integrations for the same URL.
			`      PLUM_PUBLIC_URL: "${uiUrl || ''}"`,
			'    volumes:',
			`      - "${dataAbs}:/app/data"`,
			`      - "${projectsAbs}:/app/projects"`,
			...(testsAbs ? [`      - "${testsAbs}:/app/tests"`] : []),
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
