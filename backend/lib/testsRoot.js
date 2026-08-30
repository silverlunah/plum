/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(BACKEND_DIR, 'projects');

// A project's test files live in <PROJECTS_DIR>/<id>/. Falls back to the legacy
// single `tests/` dir when no per-project folder is mounted — so single-project
// installs keep working while multi-project rolls out.
function resolveTestsRoot(projectId) {
	const perProject = path.join(PROJECTS_DIR, String(projectId));
	if (projectId != null && fs.existsSync(path.join(perProject, 'features'))) return perProject;
	return path.join(BACKEND_DIR, 'tests');
}

function featuresDir(projectId) {
	return path.join(resolveTestsRoot(projectId), 'features');
}

// True when the project has its own mounted test folder (projects/<id>/), as
// opposed to falling back to the legacy shared `tests/` dir.
function isPerProjectScaffolded(projectId) {
	return fs.existsSync(path.join(PROJECTS_DIR, String(projectId), 'features'));
}

// Minimal KEY=VALUE parse of a project's own .env — merged into a run's spawn
// env so BASE_URL and per-project secrets are read live, no restart. IS_HEADLESS
// is skipped: headless mode is set by where the run executes (the server
// container is always headless), never by a project.
function loadProjectEnv(projectId) {
	const file = path.join(resolveTestsRoot(projectId), '.env');
	const out = {};
	try {
		for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
			const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
			if (m && m[1] !== 'IS_HEADLESS') out[m[1]] = m[2].replace(/^["']|["']$/g, '');
		}
	} catch {
		// no per-project .env — the primary's own env still applies
	}
	return out;
}

module.exports = { resolveTestsRoot, featuresDir, isPerProjectScaffolded, loadProjectEnv };
