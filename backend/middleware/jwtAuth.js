/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { verifyToken } = require('../services/userService');
const prisma = require('../services/prisma');
const { AUTH_SCHEME } = require('../lib/authHeader');
const { ROLE } = require('../constants/roles');
const { runWithContext } = require('../lib/requestContext');
const { ACTIVITY_SOURCE } = require('../constants/activity');

// Open the activity-log context for the rest of the request. projectId is filled
// in later by requireProjectAccess (the store object is mutable and shared down
// the async chain); services that already know their project pass it explicitly.
function proceedWithUser(req, user, next) {
	req.user = user;
	runWithContext(
		{
			actorId: user?.userId ?? null,
			actorName: user?.name ?? null,
			viaMcp: user?.viaMcp === true,
			projectId: null,
			source: user?.viaMcp ? ACTIVITY_SOURCE.MCP : ACTIVITY_SOURCE.UI
		},
		() => next()
	);
}

// PLUM_MCP_KEY (CI) authenticates as the owner, instance-wide. A key minted in a
// project's MCP settings authenticates as the member who made it, with that
// member's role, pinned to that project (req.user.mcpProjectId). `viaMcp` flags
// the request so created rows can be attributed "<name> (MCP)".
async function resolveApiKey(token) {
	if (!token) return null;
	if (process.env.PLUM_MCP_KEY && token === process.env.PLUM_MCP_KEY) {
		const owner = await prisma.user.findFirst({
			where: { role: ROLE.OWNER },
			orderBy: { createdAt: 'asc' },
			select: { id: true, name: true }
		});
		return {
			userId: owner?.id ?? null,
			name: owner?.name,
			role: ROLE.OWNER,
			apiKey: 'instance',
			viaMcp: true
		};
	}
	const mcpKey = await prisma.mcpKey.findUnique({
		where: { key: token },
		select: { projectId: true, user: { select: { id: true, name: true, role: true } } }
	});
	if (!mcpKey) return null;
	// The key stays live only while its owner can still reach the project — a
	// member removed from the project loses their key with them.
	const stillAMember =
		mcpKey.user.role === ROLE.OWNER ||
		(await prisma.projectMember.count({
			where: { projectId: mcpKey.projectId, userId: mcpKey.user.id }
		})) > 0;
	if (!stillAMember) return null;
	return {
		userId: mcpKey.user.id,
		name: mcpKey.user.name,
		role: mcpKey.user.role,
		mcpProjectId: mcpKey.projectId,
		apiKey: 'scoped',
		viaMcp: true
	};
}

function jwtAuth(req, res, next) {
	const auth = req.headers.authorization;

	if (auth && auth.startsWith(`${AUTH_SCHEME.API_KEY} `)) {
		resolveApiKey(auth.slice(AUTH_SCHEME.API_KEY.length + 1))
			.then((user) => {
				if (!user) return res.status(401).json({ error: 'Invalid API key' });
				proceedWithUser(req, user, next);
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
			proceedWithUser(req, payload, next);
		})
		.catch(() => {
			proceedWithUser(req, payload, next);
		});
}

module.exports = { jwtAuth };
