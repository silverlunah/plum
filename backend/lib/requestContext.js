/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { AsyncLocalStorage } = require('async_hooks');

// Carries the acting user (and how they're acting — UI vs MCP key) from the auth
// middleware down to whichever service ends up writing an ActivityLog row, so
// those ~30 call sites don't each need an `actor` parameter threaded through.
const storage = new AsyncLocalStorage();

function runWithContext(context, fn) {
	return storage.run(context, fn);
}

function getContext() {
	return storage.getStore() ?? null;
}

module.exports = { runWithContext, getContext };
