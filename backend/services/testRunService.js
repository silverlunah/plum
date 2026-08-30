/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { SOCKET_EVENTS } = require('../constants/socketEvents');

let _io = null;
function setSocketIO(io) {
	_io = io;
}

// Tell everyone else on this run's execution page what just changed. `entry` is
// a partial the client merges by id; `reload` means refetch (structural change).
function emitRunChanged(runId, payload) {
	if (_io && runId)
		_io.to(`test-run:${runId}`).emit(SOCKET_EVENTS.TEST_RUN_CHANGED, { runId, ...payload });
}

const runListSelect = {
	id: true,
	title: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { id: true, name: true } },
	_count: { select: { entries: true } }
};

function runOrderBy(sortBy, sortOrder) {
	const dir = sortOrder === 'desc' ? 'desc' : 'asc';
	if (sortBy === 'title') return { title: dir };
	if (sortBy === 'status') return { status: dir };
	if (sortBy === 'updatedAt') return { updatedAt: dir };
	return { createdAt: dir };
}

async function ownsRun(projectId, id) {
	const run = await prisma.testRun.findFirst({ where: { id, projectId }, select: { id: true } });
	return !!run;
}

async function getAll(
	projectId,
	{ page = 1, limit = 20, q, sortBy = 'createdAt', sortOrder = 'desc' } = {}
) {
	const skip = (page - 1) * limit;
	const where = { projectId, ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}) };
	const orderBy = runOrderBy(sortBy, sortOrder);
	const [runs, total] = await Promise.all([
		prisma.testRun.findMany({ where, select: runListSelect, orderBy, skip, take: limit }),
		prisma.testRun.count({ where })
	]);
	return { runs, total };
}

async function getById(projectId, id) {
	return prisma.testRun.findFirst({
		where: { id, projectId },
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
					assignedToId: true,
					assignedTo: { select: { id: true, name: true } },
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

// Keep only case ids that belong to this project.
async function projectCaseIds(projectId, caseIds) {
	if (!caseIds || caseIds.length === 0) return [];
	const rows = await prisma.testCase.findMany({
		where: { id: { in: caseIds }, projectId },
		select: { id: true }
	});
	const allowed = new Set(rows.map((r) => r.id));
	return caseIds.filter((id) => allowed.has(id));
}

async function create(projectId, { title, caseIds, createdById }) {
	const ids = await projectCaseIds(projectId, caseIds);
	return prisma.testRun.create({
		data: {
			projectId,
			title,
			status: 'backlog',
			createdById,
			entries: { create: ids.map((caseId, i) => ({ caseId, order: i })) }
		},
		select: runListSelect
	});
}

async function update(projectId, id, { title, status, caseIds }) {
	if (!(await ownsRun(projectId, id))) return null;

	const data = {};
	if (title !== undefined) data.title = title;
	if (status !== undefined) data.status = status;

	if (caseIds !== undefined) {
		const ids = await projectCaseIds(projectId, caseIds);
		// Diff against existing entries instead of delete-all/recreate, so cases that
		// remain in the run keep their recorded status, notes, and assignment.
		const existing = await prisma.testRunEntry.findMany({
			where: { runId: id },
			select: { id: true, caseId: true }
		});
		const existingIdByCaseId = new Map(existing.map((e) => [e.caseId, e.id]));
		const keepCaseIds = new Set(ids);
		const removedIds = existing.filter((e) => !keepCaseIds.has(e.caseId)).map((e) => e.id);

		if (removedIds.length > 0) {
			await prisma.testRunEntry.deleteMany({ where: { id: { in: removedIds } } });
		}
		await prisma.$transaction(
			ids.map((caseId, i) =>
				existingIdByCaseId.has(caseId)
					? prisma.testRunEntry.update({
							where: { id: existingIdByCaseId.get(caseId) },
							data: { order: i }
						})
					: prisma.testRunEntry.create({ data: { runId: id, caseId, order: i } })
			)
		);
	}

	const updated = await prisma.testRun.update({ where: { id }, data, select: runListSelect });
	emitRunChanged(id, { reload: true });
	return updated;
}

async function duplicate(projectId, id, { createdById }) {
	const original = await prisma.testRun.findFirst({
		where: { id, projectId },
		select: {
			title: true,
			entries: { select: { caseId: true, order: true }, orderBy: { order: 'asc' } }
		}
	});
	if (!original) return null;
	return prisma.testRun.create({
		data: {
			projectId,
			title: `Copy of ${original.title}`,
			createdById,
			entries: { create: original.entries.map((e, i) => ({ caseId: e.caseId, order: i })) }
		},
		select: runListSelect
	});
}

async function remove(projectId, id) {
	return prisma.testRun.deleteMany({ where: { id, projectId } });
}

async function loadEntry(projectId, entryId) {
	return prisma.testRunEntry.findFirst({
		where: { id: entryId, run: { projectId } },
		select: { id: true, runId: true, caseId: true }
	});
}

async function updateEntry(projectId, entryId, { status, notes, executedById }) {
	if (!(await loadEntry(projectId, entryId))) return null;
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
			executedBy: { select: { id: true, name: true } },
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

	emitRunChanged(entry.runId, { entry });
	return entry;
}

async function assignEntry(projectId, entryId, { userId }) {
	const loaded = await loadEntry(projectId, entryId);
	if (!loaded) return null;
	const entry = await prisma.testRunEntry.update({
		where: { id: entryId },
		data: { assignedToId: userId ?? null },
		select: { id: true, assignedToId: true, assignedTo: { select: { id: true, name: true } } }
	});
	emitRunChanged(loaded.runId, { entry });
	return entry;
}

async function reorderEntries(projectId, runId, orderedEntryIds) {
	if (!(await ownsRun(projectId, runId))) return;
	await prisma.$transaction(
		orderedEntryIds.map((entryId, i) =>
			prisma.testRunEntry.update({ where: { id: entryId }, data: { order: i } })
		)
	);
	emitRunChanged(runId, { reload: true });
}

module.exports = {
	setSocketIO,
	getAll,
	getById,
	create,
	update,
	duplicate,
	remove,
	updateEntry,
	assignEntry,
	reorderEntries
};
