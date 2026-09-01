/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const { slugFor, testsPathFor, PROJECTS_DIR } = require('./projectPaths');

const BACKEND_DIR = path.resolve(__dirname, '..');

// A known project always resolves to its own projects/<slug>/<testsPath>/ (default
// "tests") — even if the folder isn't there yet, so a project with no tests reads
// as empty rather than falling through to another project's or the shared demo
// `tests/`. The legacy `tests/` dir is only for a single-project install with no slug.
function resolveTestsRoot(projectId) {
	const slug = projectId != null ? slugFor(projectId) : null;
	if (slug) return path.join(PROJECTS_DIR, slug, testsPathFor(projectId));
	return path.join(BACKEND_DIR, 'tests');
}

function featuresDir(projectId) {
	return path.join(resolveTestsRoot(projectId), 'features');
}

// Minimal KEY=VALUE parse of a project's own .env — merged into a run's spawn
// env so BASE_URL and per-project secrets are read live, no restart. IS_HEADLESS
// is skipped: headless mode is set by where the run executes (the server
// container is always headless), never by a project.
function loadProjectEnv(projectId) {
	const file = path.join(resolveTestsRoot(projectId), '.env');
	const out = {};
	try {
		// Split on \r?\n and trim the value so a CRLF .env (easy to save on
		// Windows) or a trailing space doesn't leak into BASE_URL et al.
		for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
			const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
			if (m && m[1] !== 'IS_HEADLESS') out[m[1]] = m[2].replace(/^["']|["']$/g, '');
		}
	} catch {
		// no per-project .env — the primary's own env still applies
	}
	return out;
}

module.exports = { resolveTestsRoot, featuresDir, loadProjectEnv };
