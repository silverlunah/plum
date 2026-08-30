/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { accessibleProjectIds } = require('../lib/projectContext');
const projectPaths = require('../lib/projectPaths');
const { slugify } = require('../lib/slugify');

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

// Admins are implicit members of every project, so they're added to each count
// on top of the stored (non-admin) ProjectMember rows.
async function listAll() {
	const [rows, adminCount] = await Promise.all([
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
		prisma.user.count({ where: { role: 'admin' } })
	]);
	return rows.map(({ _count, ...p }) => ({
		...p,
		memberCount: _count.members + adminCount
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

async function getMembers(projectId) {
	const rows = await prisma.projectMember.findMany({
		where: { projectId },
		select: { userId: true, role: true }
	});
	return rows;
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

module.exports = { listForUser, listAll, create, getMembers, setMembers };
