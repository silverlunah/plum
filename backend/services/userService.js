/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'plum-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';
const SALT_ROUNDS = 10;

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true };

async function needsSetup() {
	const count = await prisma.user.count();
	return count === 0;
}

async function createUser({ name, email, password, role = 'user' }) {
	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
	return prisma.user.create({
		data: { name, email, password: hashed, role },
		select: userSelect
	});
}

async function login({ email, password }) {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) return null;
	const match = await bcrypt.compare(password, user.password);
	if (!match) return null;
	const token = jwt.sign(
		{ userId: user.id, email: user.email, name: user.name, role: user.role },
		JWT_SECRET,
		{ expiresIn: JWT_EXPIRY }
	);
	return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

function verifyToken(token) {
	return jwt.verify(token, JWT_SECRET);
}

async function getAll() {
	return prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } });
}

async function getMembers() {
	return prisma.user.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' }
	});
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

async function deleteUser(id) {
	return prisma.user.delete({ where: { id } });
}

module.exports = {
	needsSetup,
	createUser,
	login,
	verifyToken,
	getAll,
	getMembers,
	getById,
	updateProfile,
	updatePassword,
	deleteUser
};
