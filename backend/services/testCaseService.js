/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const { featuresDir } = require('../lib/testsRoot');

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
	{ suiteId, title, description, priority, createdById, viaMcp = false }
) {
	const suite = await prisma.testSuite.findFirst({
		where: { id: suiteId, projectId },
		select: { id: true }
	});
	if (!suite) return null;

	const project = await prisma.project.update({
		where: { id: projectId },
		data: { caseSeqNext: { increment: 1 } },
		select: { caseSeqNext: true, testCasePrefix: true }
	});
	const num = String(project.caseSeqNext).padStart(3, '0');
	const displayId = `${project.testCasePrefix}-${num}`;

	return prisma.testCase.create({
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
	return prisma.testCase.findUnique({ where: { id }, select: caseSelect });
}

async function remove(projectId, id) {
	return prisma.testCase.deleteMany({ where: { id, projectId } });
}

async function upsertSteps(projectId, caseId, steps) {
	const tc = await prisma.testCase.findFirst({
		where: { id: caseId, projectId },
		select: { id: true }
	});
	if (!tc) return null;
	await prisma.testStep.deleteMany({ where: { caseId } });
	if (!steps || steps.length === 0) return [];
	return prisma.$transaction(
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
