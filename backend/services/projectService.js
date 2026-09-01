/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const activityService = require('./activityService');
const { accessibleProjectIds } = require('../lib/projectContext');
const projectPaths = require('../lib/projectPaths');
const { slugify } = require('../lib/slugify');
const { ROLE, ELEVATED_ROLES } = require('../constants/roles');
const { isFramework } = require('../constants/defaults');
const { ACTIVITY_ACTION, ACTIVITY_SCOPE } = require('../constants/activity');

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

// Projects the user can act in, with their display + homepage metadata.
async function listForUser(user) {
	const ids = await accessibleProjectIds(user);
	return prisma.project.findMany({
		where: { id: { in: ids } },
		select: {
			id: true,
			name: true,
			slug: true,
			logoUrl: true,
			defaultHome: true,
			manualRepositoryOnly: true,
			framework: true
		},
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
//
// `framework` is the same kind of one-shot decision: the scaffold, the runner
// command and the report shape all follow from it, so there is no update path
// for it anywhere. An unknown value falls back to the column default rather
// than erroring — the choice comes from a fixed set in the UI, not free text.
async function create({ name, framework }) {
	const org = await prisma.organization.findFirst({ orderBy: { id: 'asc' } });
	const slug = await uniqueSlug(slugify(name));
	const project = await prisma.project.create({
		data: {
			orgId: org.id,
			name,
			slug,
			...(isFramework(framework) && { framework })
		},
		select: { id: true, name: true, slug: true, framework: true }
	});
	await projectPaths.refresh();
	projectPaths.scaffoldProject(slug, project.framework);
	await activityService.record(ACTIVITY_ACTION.PROJECT_CREATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'project', id: project.id, label: project.name }
	});
	return project;
}

// Wipes a project and everything under it — suites, cases, runs, reports, cron,
// members, the projects/<slug>/ folder. Users are account-level and untouched.
// Refuses to remove the last project; an org needs at least one.
async function remove(projectId) {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { slug: true, name: true }
	});
	if (!project) return { ok: false, error: 'Project not found' };
	if ((await prisma.project.count()) <= 1) {
		return { ok: false, error: 'Cannot delete the only project' };
	}
	await prisma.project.delete({ where: { id: projectId } });
	projectPaths.removeProjectDir(project.slug);
	await projectPaths.refresh();
	await activityService.record(ACTIVITY_ACTION.PROJECT_DELETE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'project', id: projectId, label: project.name || project.slug }
	});
	return { ok: true };
}

// Owners first (implicit members of every project), then the stored members —
// each carrying its account role so the UI can badge and gate removal.
async function getMembers(projectId) {
	const userFields = { id: true, name: true, email: true, role: true };
	const [owners, rows] = await Promise.all([
		prisma.user.findMany({
			where: { role: ROLE.OWNER },
			orderBy: { createdAt: 'asc' },
			select: userFields
		}),
		prisma.projectMember.findMany({
			where: { projectId },
			select: { user: { select: userFields } }
		})
	]);
	const byId = new Map();
	for (const u of [...owners, ...rows.map((r) => r.user)]) byId.set(u.id, u);
	return [...byId.values()];
}

// Replace the project's membership with `userIds` (all as 'member'). A member
// dropped here also loses their MCP key for the project.
async function setMembers(projectId, userIds) {
	const ids = [...new Set(userIds)];
	const before = new Set(
		(await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } })).map(
			(m) => m.userId
		)
	);
	await prisma.$transaction([
		prisma.projectMember.deleteMany({ where: { projectId, userId: { notIn: ids } } }),
		prisma.mcpKey.deleteMany({
			where: { projectId, userId: { notIn: ids }, user: { role: { not: 'owner' } } }
		}),
		...ids.map((userId) =>
			prisma.projectMember.upsert({
				where: { projectId_userId: { projectId, userId } },
				create: { projectId, userId, role: 'member' },
				update: {}
			})
		)
	]);

	const added = ids.filter((id) => !before.has(id));
	const removed = [...before].filter((id) => !ids.includes(id));
	if (added.length > 0 || removed.length > 0) {
		const names = Object.fromEntries(
			(
				await prisma.user.findMany({
					where: { id: { in: [...added, ...removed] } },
					select: { id: true, name: true }
				})
			).map((u) => [u.id, u.name])
		);
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { name: true }
		});
		for (const id of added) {
			await activityService.record(ACTIVITY_ACTION.MEMBER_ADD, {
				projectId,
				target: { type: 'user', id, label: names[id] ?? id },
				metadata: { project: project?.name }
			});
		}
		for (const id of removed) {
			await activityService.record(ACTIVITY_ACTION.MEMBER_REMOVE, {
				projectId,
				target: { type: 'user', id, label: names[id] ?? id },
				metadata: { project: project?.name }
			});
		}
	}
	return getMembers(projectId);
}

module.exports = { listForUser, listAll, create, remove, getMembers, setMembers, canAdminister };
