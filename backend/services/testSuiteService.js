/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
	viaMcp: true,
	_count: { select: { cases: true } }
};

function suiteOrderBy(sortBy, sortOrder) {
	const dir = sortOrder === 'desc' ? 'desc' : 'asc';
	if (sortBy === 'displayId') return { displayId: dir };
	if (sortBy === 'name') return { name: dir };
	return { createdAt: dir };
}

async function getAll(
	projectId,
	{ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = {}
) {
	const skip = (page - 1) * limit;
	const orderBy = suiteOrderBy(sortBy, sortOrder);
	const [suites, total] = await Promise.all([
		prisma.testSuite.findMany({
			where: { projectId },
			select: suiteSelect,
			orderBy,
			skip,
			take: limit
		}),
		prisma.testSuite.count({ where: { projectId } })
	]);
	return { suites, total };
}

async function search(projectId, q) {
	const [suites, cases] = await Promise.all([
		prisma.testSuite.findMany({
			where: {
				projectId,
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
				projectId,
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

async function getAllWithCases(projectId) {
	return prisma.testSuite.findMany({
		where: { projectId },
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

async function getById(projectId, id) {
	return prisma.testSuite.findFirst({
		where: { id, projectId },
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
					viaMcp: true,
					_count: { select: { steps: true } }
				},
				orderBy: { createdAt: 'asc' }
			}
		}
	});
}

async function create(projectId, { name, description, priority, createdById, viaMcp = false }) {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: { suiteSeqNext: { increment: 1 } },
		select: { suiteSeqNext: true, testSuitePrefix: true }
	});
	const num = String(project.suiteSeqNext).padStart(3, '0');
	const displayId = `${project.testSuitePrefix}-${num}`;

	return prisma.testSuite.create({
		data: {
			projectId,
			displayId,
			name,
			description: description ?? '',
			priority: priority ?? 'Medium',
			createdById,
			viaMcp
		},
		select: suiteSelect
	});
}

async function update(projectId, id, { name, description, priority }) {
	const { count } = await prisma.testSuite.updateMany({
		where: { id, projectId },
		data: {
			...(name !== undefined && { name }),
			...(description !== undefined && { description }),
			...(priority !== undefined && { priority })
		}
	});
	if (count === 0) return null;
	return prisma.testSuite.findUnique({ where: { id }, select: suiteSelect });
}

async function remove(projectId, id) {
	return prisma.testSuite.deleteMany({ where: { id, projectId } });
}

async function migratePrefix(projectId, newPrefix) {
	const suites = await prisma.testSuite.findMany({
		where: { projectId },
		select: { id: true },
		orderBy: { createdAt: 'asc' }
	});
	const project = await prisma.project.update({
		where: { id: projectId },
		data: { testSuitePrefix: newPrefix },
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
