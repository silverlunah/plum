/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { randomUUID } = require('crypto');
const prisma = require('./prisma');
const runExecutorService = require('./runExecutorService');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { SOCKET_EVENTS } = require('../constants/socketEvents');
const { JOB_STATUS } = require('../constants/jobStatus');

const QUEUED = 'queued';
const RUNNING = 'running';
const DONE = 'done';
const CANCEL_CODE = 130;
const PRUNE_MS = 60 * 60 * 1000;

let _io = null;
function setSocketIO(io) {
	_io = io;
}

function parseRunnerIds(str) {
	const ids = (str || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return ids.length > 0 ? ids : [BUILT_IN_RUNNER_ID];
}

function normaliseRunnerIds(arr) {
	return Array.isArray(arr) && arr.length > 0 ? arr : [BUILT_IN_RUNNER_ID];
}

function rowToJob(row) {
	return {
		id: row.id,
		kind: row.kind,
		triggerType: row.triggerType,
		label: row.label,
		tag: row.tag,
		workers: row.workers,
		browser: row.browser,
		runnerIds: parseRunnerIds(row.runnerIds),
		testRunId: row.testRunId,
		baseUrl: row.baseUrl,
		notifyDiscord: row.notifyDiscord,
		notifySlack: row.notifySlack,
		startedBy: row.startedBy
	};
}

function meta(job) {
	return {
		tag: job.tag ?? '',
		workers: Number(job.workers) > 1 ? Number(job.workers) : 1,
		browser: job.browser ?? DEFAULT_BROWSER,
		startedBy: job.startedBy ?? null
	};
}

// ---------------------------------------------------------------------------
// Pump — decides which queued rows may start
// ---------------------------------------------------------------------------

let pumping = false;
let pumpAgain = false;

async function pump() {
	if (pumping) {
		pumpAgain = true;
		return;
	}
	pumping = true;
	try {
		do {
			pumpAgain = false;
			await pumpOnce();
		} while (pumpAgain);
	} catch (e) {
		console.error('[run-queue] pump failed:', e.message);
	} finally {
		pumping = false;
	}
}

async function pumpOnce() {
	const rows = await prisma.runQueue.findMany({
		where: { status: { in: [QUEUED, RUNNING] } },
		orderBy: { queuedAt: 'asc' }
	});

	// A runner is busy if a running row holds it. A queued row that can't start
	// yet still reserves its runners so a later job on the same runner waits
	// behind it (FIFO per runner) instead of jumping the line.
	const busy = new Set();
	for (const r of rows) {
		if (r.status === RUNNING) parseRunnerIds(r.runnerIds).forEach((id) => busy.add(id));
	}

	for (const r of rows) {
		if (r.status !== QUEUED) continue;
		const ids = parseRunnerIds(r.runnerIds);
		const blocked = ids.some((id) => busy.has(id));
		ids.forEach((id) => busy.add(id));
		if (blocked) continue;

		await prisma.runQueue.update({
			where: { id: r.id },
			data: { status: RUNNING, startedAt: new Date() }
		});
		dispatch(r);
	}
}

function dispatch(row) {
	runExecutorService
		.execute(rowToJob(row), _io)
		.then((res) => finalise(row.id, res))
		.catch((err) => {
			console.error(`[run-queue] run ${row.id} threw:`, err);
			finalise(row.id, { code: 1, reportId: null, note: err.message });
		});
}

async function finalise(id, { code, reportId, note }) {
	await prisma.runQueue.update({
		where: { id },
		data: {
			status: DONE,
			exitCode: code,
			reportId: reportId ?? null,
			note: note ?? null,
			finishedAt: new Date()
		}
	});
	if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_DONE, { runId: id, code, reportId: reportId ?? null });
	prune().catch(() => {});
	pump();
}

async function prune() {
	await prisma.runQueue.deleteMany({
		where: { status: DONE, finishedAt: { lt: new Date(Date.now() - PRUNE_MS) } }
	});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Adds a run request to the queue and returns its id. It starts as soon as
// every runner it targets is free; disjoint runner sets run in parallel.
async function enqueue(job) {
	const id = job.id || randomUUID();
	const runnerIds = normaliseRunnerIds(job.runnerIds);

	await prisma.runQueue.create({
		data: {
			id,
			kind: job.kind,
			triggerType: job.triggerType,
			label: job.label ?? '',
			status: QUEUED,
			tag: job.tag ?? '',
			workers: Number(job.workers) > 1 ? Number(job.workers) : 1,
			browser: job.browser ?? DEFAULT_BROWSER,
			runnerIds: runnerIds.join(','),
			testRunId: job.testRunId ?? null,
			baseUrl: job.baseUrl ?? null,
			runTitle: job.runTitle ?? null,
			startedBy: job.startedBy ?? null,
			notifyDiscord: job.notifyDiscord === true,
			notifySlack: job.notifySlack === true
		}
	});

	if (_io) {
		_io.emit(SOCKET_EVENTS.BG_RUN_QUEUED, {
			runId: id,
			kind: job.kind,
			label: job.label ?? '',
			meta: meta(job),
			runnerIds
		});
	}

	pump();
	return id;
}

// Stops a run in any state: a queued row is dropped, a running one has its local
// processes and remote node jobs killed. Emits bg-run-done either way.
async function cancel(id) {
	const row = await prisma.runQueue.findUnique({ where: { id } });
	if (!row || row.status === DONE) return false;

	if (row.status === QUEUED) {
		await prisma.runQueue.update({
			where: { id },
			data: {
				status: DONE,
				exitCode: CANCEL_CODE,
				note: 'Cancelled before it started',
				finishedAt: new Date()
			}
		});
		if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_DONE, { runId: id, code: CANCEL_CODE, reportId: null });
		pump();
		return true;
	}

	// Running — the executor's own promise then resolves with code 130 and
	// finalise() emits bg-run-done.
	await runExecutorService.cancel(id);
	return true;
}

// Back-compat shape for the HTTP trigger poll (GET /trigger/:jobId).
async function getJob(id) {
	const row = await prisma.runQueue.findUnique({ where: { id } });
	if (!row) return null;
	let status = JOB_STATUS.RUNNING;
	if (row.status === DONE) {
		status =
			row.exitCode === CANCEL_CODE
				? JOB_STATUS.CANCELLED
				: row.exitCode === 0
					? JOB_STATUS.DONE
					: JOB_STATUS.ERROR;
	}
	return {
		status,
		exitCode: row.exitCode,
		reportId: row.reportId ?? null,
		startedAt: (row.startedAt ?? row.queuedAt).getTime()
	};
}

async function listActive() {
	const rows = await prisma.runQueue.findMany({
		where: { status: { in: [QUEUED, RUNNING] } },
		orderBy: { queuedAt: 'asc' }
	});
	let queuePos = 0;
	return rows.map((r) => ({
		runId: r.id,
		status: r.status,
		kind: r.kind,
		label: r.label,
		runnerIds: parseRunnerIds(r.runnerIds),
		position: r.status === QUEUED ? ++queuePos : 0,
		meta: { tag: r.tag, workers: r.workers, browser: r.browser, startedBy: r.startedBy }
	}));
}

async function init(io) {
	setSocketIO(io);
	// Running rows can only be stale here — this process just started, so their
	// child processes died with the previous one.
	await prisma.runQueue.updateMany({
		where: { status: RUNNING },
		data: {
			status: DONE,
			exitCode: 1,
			note: 'Interrupted by a server restart',
			finishedAt: new Date()
		}
	});
	await prune();
	await pump();
}

module.exports = { setSocketIO, enqueue, cancel, getJob, listActive, init };
