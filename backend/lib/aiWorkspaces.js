/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..');
// Deliberately outside projects/: an AI session's worktree must never be
// mistaken for (or accidentally reconciled alongside) a real project folder.
const AI_WORKSPACES_DIR =
	process.env.AI_WORKSPACES_DIR || path.join(BACKEND_DIR, 'data', 'ai-workspaces');

function workspacePathFor(sessionId) {
	return path.join(AI_WORKSPACES_DIR, sessionId);
}

// The one function every workspace MCP tool funnels file paths through. An AI
// provider is an untrusted caller as far as the filesystem is concerned: this
// is the actual security boundary, not something enforced by prompting.
function resolveInWorkspace(workspaceRoot, relativePath) {
	const root = path.resolve(workspaceRoot);
	const target = path.resolve(root, relativePath || '.');
	if (target !== root && !target.startsWith(root + path.sep)) {
		const e = new Error(`Path "${relativePath}" escapes the session workspace`);
		e.status = 400;
		throw e;
	}
	return target;
}

module.exports = { AI_WORKSPACES_DIR, workspacePathFor, resolveInWorkspace };
