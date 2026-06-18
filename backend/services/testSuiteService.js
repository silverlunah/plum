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

const prisma = require('./prisma');

const suiteSelect = {
	id: true,
	displayId: true,
	name: true,
	description: true,
	priority: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { id: true, name: true } },
	_count: { select: { cases: true } }
};

function suiteOrderBy(sortBy, sortOrder) {
	const dir = sortOrder === 'desc' ? 'desc' : 'asc';
	if (sortBy === 'displayId') return { displayId: dir };
	if (sortBy === 'name') return { name: dir };
	return { createdAt: dir };
}

async function getAll({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
	const skip = (page - 1) * limit;
	const orderBy = suiteOrderBy(sortBy, sortOrder);
	const [suites, total] = await Promise.all([
		prisma.testSuite.findMany({ select: suiteSelect, orderBy, skip, take: limit }),
		prisma.testSuite.count()
	]);
	return { suites, total };
}

async function search(q) {
	const [suites, cases] = await Promise.all([
		prisma.testSuite.findMany({
			where: {
				OR: [
					{ displayId: { contains: q, mode: 'insensitive' } },
					{ name: { contains: q, mode: 'insensitive' } }
				]
			},
			select: suiteSelect,
			orderBy: { createdAt: 'asc' }
		}),
		prisma.testCase.findMany({
			where: {
				OR: [
					{ displayId: { contains: q, mode: 'insensitive' } },
					{ title: { contains: q, mode: 'insensitive' } }
				]
			},
			select: {
				id: true,
				displayId: true,
				title: true,
				priority: true,
				isAutomated: true,
				suite: { select: { id: true, displayId: true, name: true } }
			},
			orderBy: { createdAt: 'asc' }
		})
	]);
	return { suites, cases };
}

async function getAllWithCases() {
	return prisma.testSuite.findMany({
		select: {
			...suiteSelect,
			cases: {
				select: {
					id: true,
					displayId: true,
					title: true,
					priority: true,
					isAutomated: true
				},
				orderBy: { createdAt: 'asc' }
			}
		},
		orderBy: { createdAt: 'asc' }
	});
}

async function getById(id) {
	return prisma.testSuite.findUnique({
		where: { id },
		select: {
			...suiteSelect,
			cases: {
				select: {
					id: true,
					displayId: true,
					title: true,
					priority: true,
					isAutomated: true,
					createdAt: true,
					createdBy: { select: { id: true, name: true } },
					_count: { select: { steps: true } }
				},
				orderBy: { createdAt: 'asc' }
			}
		}
	});
}

async function create({ name, description, priority, createdById }) {
	const project = await prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, suiteSeqNext: 1 },
		update: { suiteSeqNext: { increment: 1 } },
		select: { suiteSeqNext: true, testSuitePrefix: true }
	});
	const num = String(project.suiteSeqNext).padStart(3, '0');
	const displayId = `${project.testSuitePrefix}-${num}`;

	return prisma.testSuite.create({
		data: {
			displayId,
			name,
			description: description ?? '',
			priority: priority ?? 'Medium',
			createdById
		},
		select: suiteSelect
	});
}

async function update(id, { name, description, priority }) {
	return prisma.testSuite.update({
		where: { id },
		data: {
			...(name !== undefined && { name }),
			...(description !== undefined && { description }),
			...(priority !== undefined && { priority })
		},
		select: suiteSelect
	});
}

async function remove(id) {
	return prisma.testSuite.delete({ where: { id } });
}

async function migratePrefix(newPrefix) {
	const suites = await prisma.testSuite.findMany({
		select: { id: true, displayId: true },
		orderBy: { createdAt: 'asc' }
	});
	const project = await prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: { testSuitePrefix: newPrefix },
		select: { testSuitePrefix: true }
	});
	for (let i = 0; i < suites.length; i++) {
		const num = String(i + 1).padStart(3, '0');
		await prisma.testSuite.update({
			where: { id: suites[i].id },
			data: { displayId: `${newPrefix}-${num}` }
		});
	}
	return project;
}

module.exports = {
	getAll,
	search,
	getAllWithCases,
	getById,
	create,
	update,
	remove,
	migratePrefix
};
