/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const activityService = require('./activityService');
const { ACTIVITY_ACTION } = require('../constants/activity');
const { featuresDir } = require('../lib/testsRoot');

const caseLabel = (c) => `${c.displayId} ${c.title}`;

function isTaggedInFeatures(projectId, displayId) {
	try {
		const dir = featuresDir(projectId);
		const tag = `@${displayId}`;
		return fs
			.readdirSync(dir)
			.filter((f) => f.endsWith('.feature'))
			.some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes(tag));
	} catch {
		return false;
	}
}

const caseSelect = {
	id: true,
	displayId: true,
	title: true,
	description: true,
	priority: true,
	isAutomated: true,
	suiteId: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { id: true, name: true } },
	viaMcp: true,
	suite: { select: { id: true, displayId: true, name: true } },
	_count: { select: { steps: true } }
};

async function getById(projectId, id) {
	return prisma.testCase.findFirst({
		where: { id, projectId },
		select: {
			...caseSelect,
			steps: { orderBy: { order: 'asc' } },
			history: {
				select: {
					id: true,
					result: true,
					source: true,
					notes: true,
					executedAt: true,
					executedBy: { select: { id: true, name: true } },
					run: { select: { id: true, title: true } },
					report: { select: { id: true, status: true, createdAt: true } }
				},
				orderBy: { executedAt: 'desc' },
				take: 50
			}
		}
	});
}

async function create(
	projectId,
	{ suiteId, title, description, priority, createdById, viaMcp = false, displayId = null }
) {
	const suite = await prisma.testSuite.findFirst({
		where: { id: suiteId, projectId },
		select: { id: true }
	});
	if (!suite) return null;

	// Import can carry an existing displayId (e.g. TC-014) to keep it lined up
	// with the source project and any matching automation script; bump the
	// sequence past it so a later auto-issued id can't collide.
	if (displayId) {
		const n = Number(String(displayId).match(/-(\d+)$/)?.[1]);
		if (Number.isFinite(n)) {
			await prisma.project.updateMany({
				where: { id: projectId, caseSeqNext: { lte: n } },
				data: { caseSeqNext: n + 1 }
			});
		}
	} else {
		const project = await prisma.project.update({
			where: { id: projectId },
			data: { caseSeqNext: { increment: 1 } },
			select: { caseSeqNext: true, testCasePrefix: true }
		});
		const num = String(project.caseSeqNext).padStart(3, '0');
		displayId = `${project.testCasePrefix}-${num}`;
	}

	const testCase = await prisma.testCase.create({
		data: {
			projectId,
			displayId,
			suiteId,
			title,
			description: description ?? '',
			priority: priority ?? 'Medium',
			createdById,
			viaMcp,
			isAutomated: isTaggedInFeatures(projectId, displayId)
		},
		select: caseSelect
	});
	await activityService.record(ACTIVITY_ACTION.TEST_CASE_CREATE, {
		projectId,
		target: { type: 'test_case', id: testCase.id, label: caseLabel(testCase) }
	});
	return testCase;
}

async function update(projectId, id, { title, description, priority, suiteId }) {
	const { count } = await prisma.testCase.updateMany({
		where: { id, projectId },
		data: {
			...(title !== undefined && { title }),
			...(description !== undefined && { description }),
			...(priority !== undefined && { priority }),
			...(suiteId !== undefined && { suiteId })
		}
	});
	if (count === 0) return null;
	const testCase = await prisma.testCase.findUnique({ where: { id }, select: caseSelect });
	await activityService.record(ACTIVITY_ACTION.TEST_CASE_UPDATE, {
		projectId,
		target: { type: 'test_case', id: testCase.id, label: caseLabel(testCase) }
	});
	return testCase;
}

async function remove(projectId, id) {
	const testCase = await prisma.testCase.findFirst({
		where: { id, projectId },
		select: { displayId: true, title: true }
	});
	const result = await prisma.testCase.deleteMany({ where: { id, projectId } });
	if (testCase) {
		await activityService.record(ACTIVITY_ACTION.TEST_CASE_DELETE, {
			projectId,
			target: { type: 'test_case', id, label: caseLabel(testCase) }
		});
	}
	return result;
}

async function upsertSteps(projectId, caseId, steps) {
	const tc = await prisma.testCase.findFirst({
		where: { id: caseId, projectId },
		select: { id: true, displayId: true, title: true }
	});
	if (!tc) return null;
	await prisma.testStep.deleteMany({ where: { caseId } });
	const created =
		!steps || steps.length === 0
			? []
			: await prisma.$transaction(
					steps.map((step, i) =>
						prisma.testStep.create({
							data: {
								caseId,
								action: step.action ?? '',
								testData: step.testData ?? '',
								expectedOutput: step.expectedOutput ?? '',
								order: i
							}
						})
					)
				);
	await activityService.record(ACTIVITY_ACTION.TEST_CASE_STEPS_UPDATE, {
		projectId,
		target: { type: 'test_case', id: caseId, label: caseLabel(tc) },
		metadata: { steps: created.length }
	});
	return created;
}

async function migratePrefix(projectId, newPrefix) {
	const cases = await prisma.testCase.findMany({
		where: { projectId },
		select: { id: true },
		orderBy: { createdAt: 'asc' }
	});
	const project = await prisma.project.update({
		where: { id: projectId },
		data: { testCasePrefix: newPrefix },
		select: { testCasePrefix: true }
	});
	for (let i = 0; i < cases.length; i++) {
		const num = String(i + 1).padStart(3, '0');
		await prisma.testCase.update({
			where: { id: cases[i].id },
			data: { displayId: `${newPrefix}-${num}` }
		});
	}
	return project;
}

module.exports = { getById, create, update, remove, upsertSteps, migratePrefix };
