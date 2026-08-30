/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { accessibleProjectIds } = require('../lib/projectContext');
const projectPaths = require('../lib/projectPaths');
const { slugify } = require('../lib/slugify');
const { ROLE, ELEVATED_ROLES } = require('../constants/roles');

// May this user manage a project's settings and membership? Owners: any project.
// Admins: only the projects they're assigned to. Everyone else: no.
async function canAdminister(user, projectId) {
	if (!ELEVATED_ROLES.includes(user?.role)) return false;
	if (user.role === ROLE.OWNER) return true;
	return (await accessibleProjectIds(user)).includes(projectId);
}

// "janns-blog", then "janns-blog-2", "janns-blog-3", … if taken.
async function uniqueSlug(base) {
	let slug = base;
	for (let n = 2; await prisma.project.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;
	return slug;
}

// Projects the user can act in, with their own name/slug/baseUrl.
async function listForUser(user) {
	const ids = await accessibleProjectIds(user);
	return prisma.project.findMany({
		where: { id: { in: ids } },
		select: { id: true, name: true, slug: true, baseUrl: true, logoUrl: true },
		orderBy: { id: 'asc' }
	});
}

// The owner is an implicit member of every project, so it's added to each count
// on top of the stored ProjectMember rows.
async function listAll() {
	const [rows, ownerCount] = await Promise.all([
		prisma.project.findMany({
			select: {
				id: true,
				name: true,
				slug: true,
				baseUrl: true,
				_count: { select: { members: true } }
			},
			orderBy: { id: 'asc' }
		}),
		prisma.user.count({ where: { role: 'owner' } })
	]);
	return rows.map(({ _count, ...p }) => ({
		...p,
		memberCount: _count.members + ownerCount
	}));
}

// `slug` is derived from the name once, here, and never changes afterwards —
// it's the project's folder and API identity. Renames don't touch it.
async function create({ name, baseUrl }) {
	const org = await prisma.organization.findFirst({ orderBy: { id: 'asc' } });
	const slug = await uniqueSlug(slugify(name));
	const project = await prisma.project.create({
		data: { orgId: org.id, name, slug, baseUrl: baseUrl ?? '' },
		select: { id: true, name: true, slug: true, baseUrl: true }
	});
	await projectPaths.refresh();
	projectPaths.scaffoldProject(slug);
	return project;
}

// Wipes a project and everything under it — suites, cases, runs, reports, cron,
// members, the projects/<slug>/ folder. Users are account-level and untouched.
// Refuses to remove the last project; an org needs at least one.
async function remove(projectId) {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { slug: true }
	});
	if (!project) return { ok: false, error: 'Project not found' };
	if ((await prisma.project.count()) <= 1) {
		return { ok: false, error: 'Cannot delete the only project' };
	}
	await prisma.project.delete({ where: { id: projectId } });
	projectPaths.removeProjectDir(project.slug);
	await projectPaths.refresh();
	return { ok: true };
}

// Owner first (implicit member of every project), then the stored members —
// each carrying its account role so the UI can badge and gate removal.
async function getMembers(projectId) {
	const userFields = { id: true, name: true, email: true, role: true };
	const [owner, rows] = await Promise.all([
		prisma.user.findFirst({ where: { role: ROLE.OWNER }, select: userFields }),
		prisma.projectMember.findMany({
			where: { projectId },
			select: { user: { select: userFields } }
		})
	]);
	const members = rows.map((r) => r.user);
	return owner ? [owner, ...members] : members;
}

// Replace the project's membership with `userIds` (all as 'member').
async function setMembers(projectId, userIds) {
	const ids = [...new Set(userIds)];
	await prisma.$transaction([
		prisma.projectMember.deleteMany({ where: { projectId, userId: { notIn: ids } } }),
		...ids.map((userId) =>
			prisma.projectMember.upsert({
				where: { projectId_userId: { projectId, userId } },
				create: { projectId, userId, role: 'member' },
				update: {}
			})
		)
	]);
	return getMembers(projectId);
}

module.exports = { listForUser, listAll, create, remove, getMembers, setMembers, canAdminister };
