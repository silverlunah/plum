/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { accessibleProjectIds } = require('../lib/projectContext');

const slugify = (s) =>
	String(s)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'project';

// Projects the user can act in, with their own name/slug/baseUrl.
async function listForUser(user) {
	const ids = await accessibleProjectIds(user);
	return prisma.project.findMany({
		where: { id: { in: ids } },
		select: { id: true, name: true, slug: true, baseUrl: true },
		orderBy: { id: 'asc' }
	});
}

async function listAll() {
	return prisma.project.findMany({
		select: {
			id: true,
			name: true,
			slug: true,
			baseUrl: true,
			_count: { select: { members: true } }
		},
		orderBy: { id: 'asc' }
	});
}

async function create({ name, baseUrl }) {
	const org = await prisma.organization.findFirst({ orderBy: { id: 'asc' } });
	let slug = slugify(name);
	if (await prisma.project.findUnique({ where: { slug } })) slug = `${slug}-${Date.now()}`;
	return prisma.project.create({
		data: { orgId: org.id, name, slug, baseUrl: baseUrl ?? '' },
		select: { id: true, name: true, slug: true, baseUrl: true }
	});
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
