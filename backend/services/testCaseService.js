/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

const FEATURES_DIR = path.join(__dirname, '../tests/features');

function isTaggedInFeatures(displayId) {
	try {
		const tag = `@${displayId}`;
		return fs
			.readdirSync(FEATURES_DIR)
			.filter((f) => f.endsWith('.feature'))
			.some((f) => fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8').includes(tag));
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
	suite: { select: { id: true, displayId: true, name: true } },
	_count: { select: { steps: true } }
};

async function getById(id) {
	return prisma.testCase.findUnique({
		where: { id },
		select: {
			...caseSelect,
			steps: {
				orderBy: { order: 'asc' }
			},
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

async function create({ suiteId, title, description, priority, createdById }) {
	const project = await prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, caseSeqNext: 1 },
		update: { caseSeqNext: { increment: 1 } },
		select: { caseSeqNext: true, testCasePrefix: true }
	});
	const num = String(project.caseSeqNext).padStart(3, '0');
	const displayId = `${project.testCasePrefix}-${num}`;

	return prisma.testCase.create({
		data: {
			displayId,
			suiteId,
			title,
			description: description ?? '',
			priority: priority ?? 'Medium',
			createdById,
			isAutomated: isTaggedInFeatures(displayId)
		},
		select: caseSelect
	});
}

async function update(id, { title, description, priority }) {
	return prisma.testCase.update({
		where: { id },
		data: {
			...(title !== undefined && { title }),
			...(description !== undefined && { description }),
			...(priority !== undefined && { priority })
		},
		select: caseSelect
	});
}

async function remove(id) {
	return prisma.testCase.delete({ where: { id } });
}

async function upsertSteps(caseId, steps) {
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

async function migratePrefix(newPrefix) {
	const cases = await prisma.testCase.findMany({
		select: { id: true, displayId: true },
		orderBy: { createdAt: 'asc' }
	});
	const project = await prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: { testCasePrefix: newPrefix },
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
