/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('../services/prisma');
const { PROJECT_HEADER } = require('../constants/project');
const { ROLE } = require('../constants/roles');

// Project ids a user may act in. Owners get every project; everyone else
// (admins included) gets their explicit memberships.
async function accessibleProjectIds(user) {
	if (user?.role === ROLE.OWNER) {
		const rows = await prisma.project.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
		return rows.map((p) => p.id);
	}
	const rows = await prisma.projectMember.findMany({
		where: { userId: user?.userId ?? '' },
		select: { projectId: true },
		orderBy: { projectId: 'asc' }
	});
	return rows.map((r) => r.projectId);
}

// The project a request acts on: the X-Plum-Project header when it names one the
// user can reach, otherwise the user's first accessible project, so single
// project installs and header-less clients keep working. null when the user has
// no project at all.
async function resolveProjectId(req) {
	// A project-scoped API key pins its own project.
	if (req.user?.mcpProjectId) return req.user.mcpProjectId;
	const ids = await accessibleProjectIds(req.user);
	const asked = Number(req.headers[PROJECT_HEADER]);
	if (Number.isInteger(asked)) return ids.includes(asked) ? asked : null;
	return ids[0] ?? null;
}

module.exports = { accessibleProjectIds, resolveProjectId };
