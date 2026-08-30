/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { verifyToken } = require('../services/userService');
const prisma = require('../services/prisma');
const { AUTH_SCHEME } = require('../lib/authHeader');
const { ROLE } = require('../constants/roles');

async function firstOwnerId() {
	const owner = await prisma.user.findFirst({
		where: { role: ROLE.OWNER },
		orderBy: { createdAt: 'asc' },
		select: { id: true }
	});
	return owner?.id ?? null;
}

// An API key authenticates as the owner. A key set via PLUM_MCP_KEY (CI) is
// instance-wide; a key generated in a project's settings is scoped to that
// project and pins req.user.mcpProjectId so requireProjectAccess honours it.
async function resolveApiKey(token) {
	if (!token) return null;
	if (process.env.PLUM_MCP_KEY && token === process.env.PLUM_MCP_KEY) {
		return { userId: await firstOwnerId(), role: ROLE.OWNER };
	}
	const project = await prisma.project.findFirst({
		where: { mcpKey: token },
		select: { id: true }
	});
	if (!project) return null;
	return { userId: await firstOwnerId(), role: ROLE.OWNER, mcpProjectId: project.id };
}

function jwtAuth(req, res, next) {
	const auth = req.headers.authorization;

	if (auth && auth.startsWith(`${AUTH_SCHEME.API_KEY} `)) {
		resolveApiKey(auth.slice(AUTH_SCHEME.API_KEY.length + 1))
			.then((user) => {
				if (!user) return res.status(401).json({ error: 'Invalid API key' });
				req.user = user;
				next();
			})
			.catch(() => res.status(401).json({ error: 'Invalid API key' }));
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
