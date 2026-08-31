/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const activityService = require('./activityService');
const { ACTIVITY_ACTION } = require('../constants/activity');

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
	const [suites, total, totalCases] = await Promise.all([
		prisma.testSuite.findMany({
			where: { projectId },
			select: suiteSelect,
			orderBy,
			skip,
			take: limit
		}),
		prisma.testSuite.count({ where: { projectId } }),
		prisma.testCase.count({ where: { suite: { projectId } } })
	]);
	return { suites, total, totalCases };
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

async function create(
	projectId,
	{ name, description, priority, createdById, viaMcp = false, displayId = null }
) {
	// Import can carry an existing displayId (e.g. TS-004) to keep it lined up
	// with the source project; bump the sequence past it so a later auto-issued
	// id can't collide. Otherwise issue the next one normally.
	if (displayId) {
		const n = Number(String(displayId).match(/-(\d+)$/)?.[1]);
		if (Number.isFinite(n)) {
			await prisma.project.updateMany({
				where: { id: projectId, suiteSeqNext: { lte: n } },
				data: { suiteSeqNext: n + 1 }
			});
		}
	} else {
		const project = await prisma.project.update({
			where: { id: projectId },
			data: { suiteSeqNext: { increment: 1 } },
			select: { suiteSeqNext: true, testSuitePrefix: true }
		});
		const num = String(project.suiteSeqNext).padStart(3, '0');
		displayId = `${project.testSuitePrefix}-${num}`;
	}

	const suite = await prisma.testSuite.create({
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
	await activityService.record(ACTIVITY_ACTION.TEST_SUITE_CREATE, {
		projectId,
		target: { type: 'test_suite', id: suite.id, label: `${suite.displayId} ${suite.name}` }
	});
	return suite;
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
	const suite = await prisma.testSuite.findUnique({ where: { id }, select: suiteSelect });
	await activityService.record(ACTIVITY_ACTION.TEST_SUITE_UPDATE, {
		projectId,
		target: { type: 'test_suite', id: suite.id, label: `${suite.displayId} ${suite.name}` }
	});
	return suite;
}

async function remove(projectId, id) {
	const suite = await prisma.testSuite.findFirst({
		where: { id, projectId },
		select: { displayId: true, name: true }
	});
	const result = await prisma.testSuite.deleteMany({ where: { id, projectId } });
	if (suite) {
		await activityService.record(ACTIVITY_ACTION.TEST_SUITE_DELETE, {
			projectId,
			target: { type: 'test_suite', id, label: `${suite.displayId} ${suite.name}` }
		});
	}
	return result;
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
