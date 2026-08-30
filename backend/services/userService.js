/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');
const projectPaths = require('../lib/projectPaths');
const { slugify } = require('../lib/slugify');
const { ROLE } = require('../constants/roles');

const JWT_SECRET = process.env.JWT_SECRET || 'plum-dev-secret-change-in-production';
const SALT_ROUNDS = 10;

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true };

async function needsSetup() {
	const count = await prisma.organization.count();
	return count === 0;
}

// One owner per instance — the count logic in listAll and the implicit-owner
// row in getMembers both assume it.
async function assertRoleAssignable(role) {
	if (role === ROLE.OWNER && (await prisma.user.count({ where: { role: ROLE.OWNER } })) > 0) {
		throw new Error('This instance already has an owner');
	}
}

async function createUser({ name, email, password, role = 'user' }) {
	await assertRoleAssignable(role);
	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
	return prisma.user.create({
		data: { name, email, password: hashed, role },
		select: userSelect
	});
}

// First boot: the organisation, its first project, and the owner — all or
// nothing. The owner reaches every project implicitly, so no ProjectMember row.
async function bootstrap({ organizationName, projectName, name, email, password }) {
	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
	const slug = slugify(projectName);
	const result = await prisma.$transaction(async (tx) => {
		const org = await tx.organization.create({ data: { name: organizationName } });
		const project = await tx.project.create({
			data: { orgId: org.id, name: projectName, slug }
		});
		const user = await tx.user.create({
			data: { name, email, password: hashed, role: ROLE.OWNER },
			select: userSelect
		});
		return { org, project, user };
	});
	await projectPaths.refresh();
	projectPaths.scaffoldProject(slug);
	return result;
}

async function login({ email, password }) {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) return null;
	const match = await bcrypt.compare(password, user.password);
	if (!match) return null;
	const token = jwt.sign(
		{ userId: user.id, email: user.email, name: user.name, role: user.role },
		JWT_SECRET
	);
	return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

function verifyToken(token) {
	return jwt.verify(token, JWT_SECRET);
}

// Each user with the projects they can reach — the owner reaches every project
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

// The whole pool an owner/admin can add to a project — everyone but the owner,
// who is already on every project.
async function getAssignablePool() {
	return prisma.user.findMany({
		where: { role: { not: ROLE.OWNER } },
		select: { id: true, name: true, email: true, role: true },
		orderBy: { name: 'asc' }
	});
}

// Who can be assigned work within one project: its explicit members plus the
// owner. Used by the test-run assignee picker.
async function getProjectMembers(projectId) {
	const [owner, memberships] = await Promise.all([
		prisma.user.findFirst({
			where: { role: ROLE.OWNER },
			orderBy: { createdAt: 'asc' },
			select: { id: true, name: true, email: true, role: true }
		}),
		prisma.projectMember.findMany({
			where: { projectId },
			select: { user: { select: { id: true, name: true, email: true, role: true } } }
		})
	]);
	const users = memberships.map((m) => m.user);
	if (owner) users.unshift(owner);
	return users.sort((a, b) => a.name.localeCompare(b.name));
}

async function getById(id) {
	return prisma.user.findUnique({ where: { id }, select: userSelect });
}

async function updateProfile(id, { name, email }) {
	if (email) {
		const conflict = await prisma.user.findFirst({ where: { email, NOT: { id } } });
		if (conflict) return { ok: false, error: 'Email already in use' };
	}
	const user = await prisma.user.update({
		where: { id },
		data: {
			...(name !== undefined && { name }),
			...(email !== undefined && { email })
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

// Refuses to demote the last owner — the instance must always have one.
async function updateUser(id, { name, email, role }) {
	const user = await prisma.user.findUnique({ where: { id } });
	if (!user) return { ok: false, error: 'User not found' };
	if (role !== undefined && !['owner', 'admin', 'user'].includes(role)) {
		return { ok: false, error: 'role must be owner, admin or user' };
	}
	if (role === ROLE.OWNER && user.role !== ROLE.OWNER) {
		const owners = await prisma.user.count({ where: { role: ROLE.OWNER } });
		if (owners > 0) return { ok: false, error: 'This instance already has an owner' };
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
	return { ok: true, user: updated };
}

async function deleteUser(id) {
	return prisma.user.delete({ where: { id } });
}

module.exports = {
	needsSetup,
	createUser,
	bootstrap,
	login,
	verifyToken,
	getAll,
	getAssignablePool,
	getProjectMembers,
	getById,
	updateProfile,
	updatePassword,
	updateUser,
	deleteUser
};
