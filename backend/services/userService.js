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

async function needsSetup() {
	const count = await prisma.user.count();
	return count === 0;
}

async function createUser({ name, email, password }) {
	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
	return prisma.user.create({
		data: { name, email, password: hashed },
		select: { id: true, name: true, email: true, createdAt: true }
	});
}

async function login({ email, password }) {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) return null;
	const match = await bcrypt.compare(password, user.password);
	if (!match) return null;
	const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET, {
		expiresIn: JWT_EXPIRY
	});
	return { token, user: { id: user.id, name: user.name, email: user.email } };
}

function verifyToken(token) {
	return jwt.verify(token, JWT_SECRET);
}

async function getAll() {
	return prisma.user.findMany({
		select: { id: true, name: true, email: true, createdAt: true },
		orderBy: { createdAt: 'asc' }
	});
}

async function getById(id) {
	return prisma.user.findUnique({
		where: { id },
		select: { id: true, name: true, email: true, createdAt: true }
	});
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

module.exports = { needsSetup, createUser, login, verifyToken, getAll, getById, updatePassword };
