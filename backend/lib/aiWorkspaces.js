/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..');
// Deliberately outside projects/: an AI session's worktree must never be
// mistaken for (or accidentally reconciled alongside) a real project folder.
const AI_WORKSPACES_DIR =
	process.env.AI_WORKSPACES_DIR || path.join(BACKEND_DIR, 'data', 'ai-workspaces');

function workspacePathFor(sessionId) {
	return path.join(AI_WORKSPACES_DIR, sessionId);
}

// Separate from the git worktree above on purpose: this is a Chrome profile
// (cookies, localStorage), it must never show up in `git status` or end up
// diffed into a PR.
const AI_BROWSER_PROFILES_DIR =
	process.env.AI_BROWSER_PROFILES_DIR || path.join(BACKEND_DIR, 'data', 'ai-browser-profiles');

function browserProfilePathFor(sessionId) {
	return path.join(AI_BROWSER_PROFILES_DIR, sessionId);
}

function escapeError(relativePath) {
	const e = new Error(`Path "${relativePath}" escapes the session workspace`);
	e.status = 400;
	throw e;
}

// A workspace is a fresh `git clone` of whatever repo the project connects,
// content this instance doesn't control: a symlink committed there (planted
// deliberately, or via a compromised dependency/template) resolves at the OS
// level regardless of how lexically "inside" the path looks, and
// readFileSync/writeFileSync follow it transparently. The lexical check above
// alone would let read_file/write_file escape through one. Walk up from the
// target to its nearest existing ancestor, resolve *that* for real symlinks,
// and confirm the real path still lands inside the workspace's own real root.
function assertRealPathInside(realRoot, target, relativePath) {
	let existing = target;
	let suffix = '';
	while (!fs.existsSync(existing)) {
		suffix = path.join(path.basename(existing), suffix);
		const parent = path.dirname(existing);
		if (parent === existing) break; // reached the filesystem root
		existing = parent;
	}
	const realExisting = fs.realpathSync(existing);
	const realTarget = suffix ? path.join(realExisting, suffix) : realExisting;
	if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
		escapeError(relativePath);
	}
}

// The one function every workspace MCP tool funnels file paths through. An AI
// provider is an untrusted caller as far as the filesystem is concerned: this
// is the actual security boundary, not something enforced by prompting.
function resolveInWorkspace(workspaceRoot, relativePath) {
	const root = path.resolve(workspaceRoot);
	const target = path.resolve(root, relativePath || '.');
	if (target !== root && !target.startsWith(root + path.sep)) {
		escapeError(relativePath);
	}
	assertRealPathInside(fs.realpathSync(root), target, relativePath);
	return target;
}

module.exports = {
	AI_WORKSPACES_DIR,
	workspacePathFor,
	resolveInWorkspace,
	AI_BROWSER_PROFILES_DIR,
	browserProfilePathFor
};
