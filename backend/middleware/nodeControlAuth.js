/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { jwtAuth } = require('./jwtAuth');
const { requireOwner } = require('./requireOwner');
const { AUTH_SCHEME } = require('../lib/authHeader');

// PLUM_NODE_SECRET (CLI, no browser session) or the owner's JWT (web Settings).
function nodeControlAuth(req, res, next) {
	const secret = process.env.PLUM_NODE_SECRET;
	const auth = req.headers.authorization;
	if (
		secret &&
		auth &&
		auth.startsWith(`${AUTH_SCHEME.BEARER} `) &&
		auth.slice(AUTH_SCHEME.BEARER.length + 1) === secret
	) {
		return next();
	}
	jwtAuth(req, res, () => requireOwner(req, res, next));
}

module.exports = { nodeControlAuth };
