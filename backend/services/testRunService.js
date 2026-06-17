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

const runListSelect = {
	id: true,
	title: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { id: true, name: true } },
	_count: { select: { entries: true } }
};

async function getAll() {
	return prisma.testRun.findMany({ select: runListSelect, orderBy: { createdAt: 'desc' } });
}

async function getById(id) {
	return prisma.testRun.findUnique({
		where: { id },
		select: {
			id: true,
			title: true,
			status: true,
			createdAt: true,
			updatedAt: true,
			createdBy: { select: { id: true, name: true } },
			entries: {
				select: {
					id: true,
					order: true,
					status: true,
					notes: true,
					executedAt: true,
					executedBy: { select: { id: true, name: true } },
					case: {
						select: {
							id: true,
							displayId: true,
							title: true,
							priority: true,
							isAutomated: true,
							suite: { select: { id: true, name: true, displayId: true } },
							steps: { orderBy: { order: 'asc' } }
						}
					}
				},
				orderBy: { order: 'asc' }
			}
		}
	});
}

async function create({ title, caseIds, createdById }) {
	const run = await prisma.testRun.create({
		data: {
			title,
			createdById,
			entries: {
				create: (caseIds ?? []).map((caseId, i) => ({ caseId, order: i }))
			}
		},
		select: runListSelect
	});
	return run;
}

async function update(id, { title, status, caseIds }) {
	const data = {};
	if (title !== undefined) data.title = title;
	if (status !== undefined) data.status = status;

	if (caseIds !== undefined) {
		await prisma.testRunEntry.deleteMany({ where: { runId: id } });
		await prisma.$transaction(
			caseIds.map((caseId, i) =>
				prisma.testRunEntry.create({ data: { runId: id, caseId, order: i } })
			)
		);
	}

	return prisma.testRun.update({ where: { id }, data, select: runListSelect });
}

async function duplicate(id, { createdById }) {
	const original = await prisma.testRun.findUnique({
		where: { id },
		select: {
			title: true,
			entries: { select: { caseId: true, order: true }, orderBy: { order: 'asc' } }
		}
	});
	if (!original) return null;
	return prisma.testRun.create({
		data: {
			title: `Copy of ${original.title}`,
			createdById,
			entries: { create: original.entries.map((e, i) => ({ caseId: e.caseId, order: i })) }
		},
		select: runListSelect
	});
}

async function remove(id) {
	return prisma.testRun.delete({ where: { id } });
}

async function updateEntry(entryId, { status, notes, executedById }) {
	const entry = await prisma.testRunEntry.update({
		where: { id: entryId },
		data: {
			status,
			notes: notes ?? '',
			executedById: executedById ?? null,
			executedAt: new Date()
		},
		select: {
			id: true,
			status: true,
			notes: true,
			executedAt: true,
			runId: true,
			caseId: true
		}
	});

	if (status === 'pass' || status === 'fail' || status === 'blocked' || status === 'skip') {
		await prisma.testCaseHistory.create({
			data: {
				caseId: entry.caseId,
				runId: entry.runId,
				result: status,
				source: 'manual',
				notes: notes ?? '',
				executedById: executedById ?? null
			}
		});
	}

	return entry;
}

async function reorderEntries(runId, orderedEntryIds) {
	await prisma.$transaction(
		orderedEntryIds.map((entryId, i) =>
			prisma.testRunEntry.update({ where: { id: entryId }, data: { order: i } })
		)
	);
}

module.exports = {
	getAll,
	getById,
	create,
	update,
	duplicate,
	remove,
	updateEntry,
	reorderEntries
};
