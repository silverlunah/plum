/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { jwtAuth } = require('./jwtAuth');
const { requireAdmin } = require('./requireAdmin');
const runnerService = require('../services/runnerService');
const { AUTH_SCHEME } = require('../lib/authHeader');

/**
 * Accepts either a logged-in admin (web Settings UI) or any currently-registered
 * runner's own token (manage-runners.mjs and node self-registration have no
 * browser session/JWT to present, but every runner already has a token
 * generated at registration — reuse it instead of a second credential).
 */
async function runnerOrAdmin(req, res, next) {
	const auth = req.headers.authorization;
	if (auth && auth.startsWith(`${AUTH_SCHEME.BEARER} `)) {
		const token = auth.slice(AUTH_SCHEME.BEARER.length + 1);
		if (await runnerService.isValidToken(token)) return next();
	}
	jwtAuth(req, res, () => requireAdmin(req, res, next));
}

module.exports = { runnerOrAdmin };
