/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');
const activityService = require('./activityService');
const projectPaths = require('../lib/projectPaths');
const projectService = require('./projectService');
const notificationInboxService = require('./notificationInboxService');
const { slugify } = require('../lib/slugify');
const { ROLE } = require('../constants/roles');
const { isFramework } = require('../constants/defaults');
const { ACTIVITY_ACTION, ACTIVITY_SCOPE } = require('../constants/activity');
const { accessibleProjectIds } = require('../lib/projectContext');

const { DEFAULT_JWT_SECRET } = require('../lib/appSecret');
const { DEFAULT_SESSION_MAX_HOURS } = require('../constants/session');
const SALT_ROUNDS = 10;

// Read at call time: server.js resolves the real secret into the env at boot.
const jwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

const userSelect = {
	id: true,
	name: true,
	email: true,
	role: true,
	createdAt: true,
	defaultProjectId: true
};

// Which roles each role may reset a password for. Deliberately role-based, not
// project-scoped: an admin can reset any plain user, not only those sharing a
// project. No entry (e.g. a plain user) means "may reset nobody".
const RESETTABLE_BY = Object.freeze({
	[ROLE.OWNER]: [ROLE.ADMIN, ROLE.USER],
	[ROLE.ADMIN]: [ROLE.USER]
});

async function needsSetup() {
	const count = await prisma.organization.count();
	return count === 0;
}

async function createUser({ name, email, password, role = 'user' }) {
	if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
		const err = new Error('A user with that email already exists.');
		err.status = 409;
		throw err;
	}
	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
	const user = await prisma.user.create({
		data: { name, email, password: hashed, role },
		select: userSelect
	});
	await activityService.record(ACTIVITY_ACTION.USER_CREATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'user', id: user.id, label: user.name },
		metadata: { role: user.role }
	});
	return user;
}

// First boot: the organisation, its first project, and the owner, all or
// nothing. The owner reaches every project implicitly, so no ProjectMember row.
// A GitHub token is accepted here (rather than requiring a later trip to
// Integrations) only because it's the one moment a repo choice can be wired up
// for the org's first project; every other org setting still lives in Settings.
async function bootstrap({
	organizationName,
	projectName,
	name,
	email,
	password,
	framework,
	githubToken,
	repo
}) {
	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
	const slug = slugify(projectName);
	const result = await prisma.$transaction(async (tx) => {
		const org = await tx.organization.create({
			data: {
				name: organizationName,
				termsAcceptedAt: new Date(),
				...(githubToken && { githubToken })
			}
		});
		const project = await tx.project.create({
			data: { orgId: org.id, name: projectName, slug, ...(isFramework(framework) && { framework }) }
		});
		const user = await tx.user.create({
			data: { name, email, password: hashed, role: ROLE.OWNER },
			select: userSelect
		});
		return { org, project, user };
	});
	await projectPaths.refresh();
	if (repo?.repoMode !== 'existing') projectPaths.scaffoldProject(slug, result.project.framework);
	if (githubToken && repo?.repoMode) {
		await projectService.setupRepository(result.project, repo);
	}
	return result;
}

async function issueSession(user) {
	const org = await prisma.organization.findFirst({
		orderBy: { id: 'asc' },
		select: { sessionMaxHours: true }
	});
	const token = jwt.sign(
		{ userId: user.id, email: user.email, name: user.name, role: user.role },
		jwtSecret(),
		{ expiresIn: (org?.sessionMaxHours ?? DEFAULT_SESSION_MAX_HOURS) * 3600 }
	);
	return {
		token,
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			defaultProjectId: user.defaultProjectId
		}
	};
}

// Fires once per user, the first time they ever log in (checked via a column
// set right here, not "first ever" in some more general sense). Never allowed
// to fail the login itself.
async function seedFirstLoginNotifications(user) {
	if (user.firstLoginNotifiedAt) return;
	try {
		await prisma.user.update({
			where: { id: user.id },
			data: { firstLoginNotifiedAt: new Date() }
		});
		await notificationInboxService.create({
			userId: user.id,
			type: 'setup_project',
			title: 'Set up your project',
			body: 'Add a name and logo for your first project.',
			link: '/settings?section=project'
		});
		await notificationInboxService.create({
			userId: user.id,
			type: 'connect_integrations',
			title: 'Connect GitHub & AI',
			body: 'Add provider keys and a GitHub token to unlock the AI agent.',
			link: '/settings?section=integrations'
		});
	} catch {}
}

async function login({ email, password }) {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) return null;
	const match = await bcrypt.compare(password, user.password);
	if (!match) return null;
	await seedFirstLoginNotifications(user);
	return issueSession(user);
}

// Google has already vetted the account; we only sign in an email that an owner
// has already added to Plum. The `sub` is linked to that row on first use.
async function loginWithGoogle({ googleId, email, emailVerified, name }) {
	if (!emailVerified) return { ok: false, error: 'Your Google email is not verified.' };

	let user = await prisma.user.findUnique({ where: { googleId } });
	if (!user) {
		user = await prisma.user.findUnique({ where: { email } });
		if (!user) {
			return {
				ok: false,
				error: `No Plum account for ${email}. Ask an owner to add you first.`
			};
		}
		if (user.googleId && user.googleId !== googleId) {
			return { ok: false, error: 'This account is linked to a different Google identity.' };
		}
		user = await prisma.user.update({
			where: { id: user.id },
			data: { googleId, ...(name && user.name !== name && { name }) }
		});
	}
	await seedFirstLoginNotifications(user);
	return { ok: true, ...(await issueSession(user)) };
}

function verifyToken(token) {
	return jwt.verify(token, jwtSecret());
}

// Each user with the projects they can reach: the owner reaches every project
// implicitly, everyone else only their explicit memberships.
async function getAll() {
	const projectSelect = { id: true, name: true, slug: true };
	const [users, allProjects] = await Promise.all([
		prisma.user.findMany({
			select: {
				...userSelect,
				projectMemberships: { select: { project: { select: projectSelect } } }
			},
			orderBy: { createdAt: 'asc' }
		}),
		prisma.project.findMany({ select: projectSelect, orderBy: { id: 'asc' } })
	]);
	return users.map(({ projectMemberships, ...u }) => ({
		...u,
		projects: u.role === ROLE.OWNER ? allProjects : projectMemberships.map((m) => m.project)
	}));
}

// The whole pool an owner/admin can add to a project, everyone but the owner,
// who is already on every project.
async function getAssignablePool() {
	return prisma.user.findMany({
		where: { role: { not: ROLE.OWNER } },
		select: { id: true, name: true, email: true, role: true },
		orderBy: { name: 'asc' }
	});
}

// Who can be assigned work within one project: its explicit members plus every
// owner (owners reach every project). Used by the test-run assignee picker.
async function getProjectMembers(projectId) {
	const [owners, memberships] = await Promise.all([
		prisma.user.findMany({
			where: { role: ROLE.OWNER },
			select: { id: true, name: true, email: true, role: true }
		}),
		prisma.projectMember.findMany({
			where: { projectId },
			select: { user: { select: { id: true, name: true, email: true, role: true } } }
		})
	]);
	const byId = new Map();
	for (const u of [...owners, ...memberships.map((m) => m.user)]) byId.set(u.id, u);
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function getById(id) {
	return prisma.user.findUnique({ where: { id }, select: userSelect });
}

// `requester` is req.user (the JWT payload), needed only to check defaultProjectId
// is somewhere the caller can actually reach, an owner or admin's own choice, not
// enforced against other members.
async function updateProfile(id, { name, email, defaultProjectId }, requester) {
	if (email) {
		const conflict = await prisma.user.findFirst({ where: { email, NOT: { id } } });
		if (conflict) return { ok: false, error: 'Email already in use' };
	}
	if (defaultProjectId !== undefined && defaultProjectId !== null) {
		const allowed = await accessibleProjectIds(requester);
		if (!allowed.includes(defaultProjectId)) {
			return { ok: false, error: 'You do not have access to that project' };
		}
	}
	const user = await prisma.user.update({
		where: { id },
		data: {
			...(name !== undefined && { name }),
			...(email !== undefined && { email }),
			...(defaultProjectId !== undefined && { defaultProjectId })
		},
		select: userSelect
	});
	return { ok: true, user };
}

async function updatePassword(id, { currentPassword, newPassword }) {
	const user = await prisma.user.findUnique({ where: { id } });
	if (!user) return { ok: false, error: 'User not found' };
	const match = await bcrypt.compare(currentPassword, user.password);
	if (!match) return { ok: false, error: 'Current password is incorrect' };
	const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
	await prisma.user.update({ where: { id }, data: { password: hashed } });
	return { ok: true };
}

async function getResettableUsers(actorRole) {
	const roles = RESETTABLE_BY[actorRole] ?? [];
	if (roles.length === 0) return [];
	return prisma.user.findMany({
		where: { role: { in: roles } },
		select: { id: true, name: true, email: true, role: true },
		orderBy: { name: 'asc' }
	});
}

// Sets a fresh random password and returns it once, in the clear, for the
// owner/admin to hand over, it is never stored or shown again.
async function resetPassword(actor, targetId) {
	const target = await prisma.user.findUnique({ where: { id: targetId } });
	if (!target) return { ok: false, status: 404, error: 'User not found' };
	if (!(RESETTABLE_BY[actor.role] ?? []).includes(target.role)) {
		return { ok: false, status: 403, error: 'You cannot reset this user’s password' };
	}
	const tempPassword = crypto.randomBytes(12).toString('base64url');
	await prisma.user.update({
		where: { id: targetId },
		data: { password: await bcrypt.hash(tempPassword, SALT_ROUNDS) }
	});
	await activityService.record(ACTIVITY_ACTION.USER_PASSWORD_RESET, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'user', id: targetId, label: target.name }
	});
	return { ok: true, tempPassword };
}

// Refuses to demote the last owner: the instance must always have one.
async function updateUser(id, { name, email, role }) {
	const user = await prisma.user.findUnique({ where: { id } });
	if (!user) return { ok: false, error: 'User not found' };
	if (role !== undefined && !['owner', 'admin', 'user'].includes(role)) {
		return { ok: false, error: 'role must be owner, admin or user' };
	}
	if (email) {
		const conflict = await prisma.user.findFirst({ where: { email, NOT: { id } } });
		if (conflict) return { ok: false, error: 'Email already in use' };
	}
	if (user.role === ROLE.OWNER && role !== undefined && role !== ROLE.OWNER) {
		const owners = await prisma.user.count({ where: { role: ROLE.OWNER } });
		if (owners <= 1) return { ok: false, error: 'The instance must keep an owner' };
	}
	const updated = await prisma.user.update({
		where: { id },
		data: {
			...(name !== undefined && { name }),
			...(email !== undefined && { email }),
			...(role !== undefined && { role })
		},
		select: userSelect
	});

	if (role !== undefined && role !== user.role) {
		await activityService.record(ACTIVITY_ACTION.USER_ROLE_CHANGE, {
			scope: ACTIVITY_SCOPE.ORG,
			target: { type: 'user', id, label: updated.name },
			metadata: { from: user.role, to: role }
		});
	}
	if (name !== undefined || email !== undefined) {
		await activityService.record(ACTIVITY_ACTION.USER_UPDATE, {
			scope: ACTIVITY_SCOPE.ORG,
			target: { type: 'user', id, label: updated.name }
		});
	}
	return { ok: true, user: updated };
}

async function deleteUser(id) {
	const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
	const result = await prisma.user.delete({ where: { id } });
	if (user) {
		await activityService.record(ACTIVITY_ACTION.USER_DELETE, {
			scope: ACTIVITY_SCOPE.ORG,
			target: { type: 'user', id, label: user.name }
		});
	}
	return result;
}

module.exports = {
	needsSetup,
	createUser,
	bootstrap,
	login,
	loginWithGoogle,
	verifyToken,
	getAll,
	getAssignablePool,
	getProjectMembers,
	getById,
	updateProfile,
	updatePassword,
	getResettableUsers,
	resetPassword,
	updateUser,
	deleteUser
};
