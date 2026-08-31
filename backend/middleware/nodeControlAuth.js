/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { jwtAuth } = require('./jwtAuth');
const { requireOwner } = require('./requireOwner');
const { AUTH_SCHEME } = require('../lib/authHeader');

function presentsNodeSecret(req) {
	const secret = process.env.PLUM_NODE_SECRET;
	const auth = req.headers.authorization;
	return (
		secret &&
		auth &&
		auth.startsWith(`${AUTH_SCHEME.BEARER} `) &&
		auth.slice(AUTH_SCHEME.BEARER.length + 1) === secret
	);
}

// Mutating a node — PLUM_NODE_SECRET (CLI, no browser session) or the owner's JWT.
function nodeControlAuth(req, res, next) {
	if (presentsNodeSecret(req)) return next();
	jwtAuth(req, res, () => requireOwner(req, res, next));
}

// Reading the fleet — any signed-in member (they pick a node for a run), plus the
// secret so `plum node`'s pre-register check still works.
function nodeReadAuth(req, res, next) {
	if (presentsNodeSecret(req)) return next();
	jwtAuth(req, res, next);
}

module.exports = { nodeControlAuth, nodeReadAuth };
