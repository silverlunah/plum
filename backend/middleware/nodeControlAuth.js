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

// A JWT always carries two dots. Anything else in the Bearer slot was meant as
// the registration secret, and reporting that as "Invalid or expired token" (what
// jwtAuth says for an unparseable token) sends people hunting a session problem
// instead of a wrong secret.
const looksLikeJwt = (req) => {
	const auth = req.headers.authorization ?? '';
	return auth.slice(AUTH_SCHEME.BEARER.length + 1).split('.').length === 3;
};

// Mutating a node, PLUM_NODE_SECRET (CLI, no browser session) or the owner's JWT.
function nodeControlAuth(req, res, next) {
	if (presentsNodeSecret(req)) return next();
	if (req.headers.authorization?.startsWith(`${AUTH_SCHEME.BEARER} `) && !looksLikeJwt(req)) {
		return res.status(401).json({
			error: 'Invalid registration secret. Settings → Runners → Registration secret.'
		});
	}
	jwtAuth(req, res, () => requireOwner(req, res, next));
}

// Reading the fleet, any signed-in member (they pick a node for a run), plus the
// secret so `plum node`'s pre-register check still works.
function nodeReadAuth(req, res, next) {
	if (presentsNodeSecret(req)) return next();
	jwtAuth(req, res, next);
}

module.exports = { nodeControlAuth, nodeReadAuth };
