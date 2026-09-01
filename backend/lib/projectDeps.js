/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveTestsRoot } = require('./testsRoot');

// Records which dependency set the current node_modules was installed for, so an
// unchanged package.json never triggers a reinstall. Lives inside node_modules
// so deleting that folder is enough to force a clean install.
const MARKER_FILE = '.plum-deps';

function declaredDependencies(testsRoot) {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(testsRoot, 'package.json'), 'utf8'));
		return pkg.dependencies ?? {};
	} catch {
		return {};
	}
}

const dependencyHash = (deps) =>
	crypto
		.createHash('sha256')
		.update(JSON.stringify(Object.entries(deps).sort()))
		.digest('hex');

/**
 * Installs a project's own extra dependencies into its tests folder, and only
 * when it declares some.
 *
 * A project that declares none needs no install at all: everything Plum provides
 * (Playwright, Cucumber, ts-node) resolves from the backend's own node_modules by
 * walking up the tree, since projects live inside it. Declaring a dependency here
 * puts it in projects/<slug>/<testsPath>/node_modules, where it shadows nothing
 * and no other project sees it — unlike the old plum.plugins.json, which
 * installed one project's packages into the backend for every project.
 *
 * Synchronous on purpose: a run must not start against a half-installed folder.
 */
function ensureProjectDeps(projectId, { onLog = () => {} } = {}) {
	const testsRoot = resolveTestsRoot(projectId);
	const deps = declaredDependencies(testsRoot);
	const names = Object.keys(deps);
	if (names.length === 0) return;

	const marker = path.join(testsRoot, 'node_modules', MARKER_FILE);
	const wanted = dependencyHash(deps);
	try {
		if (fs.readFileSync(marker, 'utf8').trim() === wanted) return;
	} catch {
		// no marker, or an unreadable one — install and rewrite it
	}

	onLog(`Installing project dependencies: ${names.join(', ')}\n`);
	try {
		execSync('npm install --no-audit --no-fund', {
			cwd: testsRoot,
			stdio: 'pipe',
			encoding: 'utf8'
		});
		fs.mkdirSync(path.dirname(marker), { recursive: true });
		fs.writeFileSync(marker, wanted, 'utf8');
	} catch (e) {
		// Surfaced in the run log rather than thrown: the tests may not need the
		// package that failed, and a run that fails on a real import is a clearer
		// signal than a run that never starts.
		onLog(`[ERROR] Could not install project dependencies: ${e.message}\n`);
	}
}

module.exports = { ensureProjectDeps, declaredDependencies };
