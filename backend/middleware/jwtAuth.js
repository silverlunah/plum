/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { verifyToken } = require('../services/userService');
const prisma = require('../services/prisma');
const { AUTH_SCHEME } = require('../lib/authHeader');

function jwtAuth(req, res, next) {
	const auth = req.headers.authorization;

	// MCP API key — resolves to the first admin user so createdById is always valid
	const mcpKey = process.env.PLUM_MCP_KEY;
	if (mcpKey && auth === `${AUTH_SCHEME.API_KEY} ${mcpKey}`) {
		prisma.user
			.findFirst({ where: { role: 'admin' }, select: { id: true } })
			.then((admin) => {
				req.user = { userId: admin?.id ?? null };
				next();
			})
			.catch(() => {
				req.user = { userId: null };
				next();
			});
		return;
	}

	if (!auth || !auth.startsWith(`${AUTH_SCHEME.BEARER} `)) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	let payload;
	try {
		payload = verifyToken(auth.slice(AUTH_SCHEME.BEARER.length + 1));
	} catch {
		return res.status(401).json({ error: 'Invalid or expired token' });
	}
	// Confirm the user still exists — catches stale JWTs after a DB reset
	prisma.user
		.findUnique({ where: { id: payload.userId }, select: { id: true } })
		.then((user) => {
			if (!user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
			req.user = payload;
			next();
		})
		.catch(() => {
			req.user = payload;
			next();
		});
}

module.exports = { jwtAuth };
