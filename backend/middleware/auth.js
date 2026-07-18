/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { AUTH_SCHEME } = require('../lib/authHeader');

/**
 * Bearer-token auth guard for node-mode API routes.
 * Passes through when NODE_TOKEN is not configured (open/dev environments).
 */
function authGuard(req, res, next) {
	const nodeToken = process.env.NODE_TOKEN;
	if (!nodeToken) return next();
	const auth = req.headers.authorization;
	if (!auth || auth !== `${AUTH_SCHEME.BEARER} ${nodeToken}`) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	next();
}

module.exports = { authGuard };
