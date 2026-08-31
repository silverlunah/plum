/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { AUTH_SCHEME } = require('../lib/authHeader');

// Fails closed: these routes run arbitrary test code, so no NODE_TOKEN = no access.
function authGuard(req, res, next) {
	const nodeToken = process.env.NODE_TOKEN;
	if (!nodeToken) {
		return res.status(503).json({ error: 'Node runner is not configured (missing NODE_TOKEN)' });
	}
	const auth = req.headers.authorization;
	if (!auth || auth !== `${AUTH_SCHEME.BEARER} ${nodeToken}`) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	next();
}

module.exports = { authGuard };
