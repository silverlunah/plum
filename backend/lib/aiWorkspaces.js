/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..');
// Outside projects/ so an analysis clone is never mistaken for a real project folder.
const AI_WORKSPACES_DIR =
	process.env.AI_WORKSPACES_DIR || path.join(BACKEND_DIR, 'data', 'ai-workspaces');

function workspacePathFor(analysisId) {
	return path.join(AI_WORKSPACES_DIR, analysisId);
}

function escapeError(relativePath) {
	const e = new Error(`Path "${relativePath}" escapes the workspace`);
	e.status = 400;
	throw e;
}

// A workspace is a clone of a repo this instance doesn't control, so a committed
// symlink would slip past a purely lexical containment check.
function assertRealPathInside(realRoot, target, relativePath) {
	let existing = target;
	let suffix = '';
	while (!fs.existsSync(existing)) {
		suffix = path.join(path.basename(existing), suffix);
		const parent = path.dirname(existing);
		if (parent === existing) break;
		existing = parent;
	}
	const realExisting = fs.realpathSync(existing);
	const realTarget = suffix ? path.join(realExisting, suffix) : realExisting;
	if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
		escapeError(relativePath);
	}
}

// The security boundary every AI file tool funnels through, not something prompting enforces.
function resolveInside(rootDir, relativePath) {
	const root = path.resolve(rootDir);
	const target = path.resolve(root, relativePath || '.');
	if (target !== root && !target.startsWith(root + path.sep)) {
		escapeError(relativePath);
	}
	assertRealPathInside(fs.realpathSync(root), target, relativePath);
	return target;
}

async function removeWorkspace(analysisId) {
	await fs.promises.rm(workspacePathFor(analysisId), { recursive: true, force: true });
}

module.exports = {
	AI_WORKSPACES_DIR,
	workspacePathFor,
	resolveInside,
	removeWorkspace
};
