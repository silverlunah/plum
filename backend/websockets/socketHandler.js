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

const { spawn } = require('child_process');
const runnerService = require('../services/runnerService');
const reportService = require('../services/reportService');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID, TRIGGER_REMOTE } = require('../constants/triggers');
const { getTestIdsForTag, chunkTests, buildTagExpression } = require('../lib/testChunker');
const { readCucumberReportFile } = require('../lib/reportFilename');

const socketHandler = (io) => {
	io.on('connection', (socket) => {
		console.log('WebSocket connection established');

		// Track processes spawned for this socket connection so we can cancel them
		const activeProcs = new Set();

		socket.on('run-test', async (payload, legacyWorkers) => {
			let tag, workers, browser, runners;
			if (typeof payload === 'string') {
				tag = payload;
				workers = Number(legacyWorkers) > 1 ? Number(legacyWorkers) : 1;
				browser = 'chromium';
				runners = [BUILT_IN_RUNNER_ID];
			} else {
				tag = payload.tag ?? '';
				workers = Number(payload.workers) > 1 ? Number(payload.workers) : 1;
				browser = payload.browser ?? 'chromium';
				runners =
					Array.isArray(payload.runners) && payload.runners.length > 0
						? payload.runners
						: [BUILT_IN_RUNNER_ID];
			}

			const isSingleBuiltIn = runners.length === 1 && runners[0] === BUILT_IN_RUNNER_ID;

			if (isSingleBuiltIn) {
				runBuiltIn(io, socket, activeProcs, tag, workers, browser);
			} else {
				runDistributed(io, socket, activeProcs, tag, workers, browser, runners);
			}
		});

		socket.on('cancel-test', () => {
			if (activeProcs.size === 0) return;
			for (const proc of activeProcs) {
				try {
					proc.kill('SIGTERM');
				} catch {}
			}
			activeProcs.clear();
			socket.emit('log', '\n[CANCELLED] Test run cancelled by user.\n');
			socket.emit('done', 130);
		});
	});
};

// ---------------------------------------------------------------------------
// Single built-in runner
// ---------------------------------------------------------------------------

function runBuiltIn(io, socket, activeProcs, tag, workers, browser) {
	const env = {
		...process.env,
		TAG: tag,
		TRIGGER: TRIGGER_TYPE.MANUAL,
		REPORT_RUNNERS: String(workers),
		BROWSER: browser
	};
	if (workers > 1) env.PARALLEL = String(workers);

	const proc = spawn('npm', ['run', 'test'], { env, shell: true });
	activeProcs.add(proc);

	proc.stdout.on('data', (d) => socket.emit('log', d.toString()));
	proc.stderr.on('data', (d) => socket.emit('log', `[ERROR] ${d.toString()}`));

	proc.on('close', (code) => {
		activeProcs.delete(proc);
		socket.emit('log', `\nTest finished with code ${code}`);
		socket.emit('done', code);
		// Notify all connected clients that a new report is available
		io.emit('report-ready');
	});
}

// ---------------------------------------------------------------------------
// Distributed (multi-runner) path
// ---------------------------------------------------------------------------

async function runDistributed(io, socket, activeProcs, tag, workers, browser, runnerIds) {
	const allIds = getTestIdsForTag(tag);
	const chunks = chunkTests(allIds, runnerIds.length);

	const laneInfos = await Promise.all(
		runnerIds.map(async (id) => {
			if (id === BUILT_IN_RUNNER_ID) return { id, name: 'Built-in', dbId: null };
			const r = await runnerService.getById(id);
			return { id, name: r?.name ?? id, dbId: r?.id ?? null };
		})
	);

	socket.emit(
		'runner-lanes-init',
		laneInfos.map((l, i) => ({ id: l.id, name: l.name, testCount: (chunks[i] || []).length }))
	);

	const total = runnerIds.length;
	const collectedReports = new Array(total).fill(null);
	let doneCount = 0;
	let overallCode = 0;

	function onLaneDone(idx, laneId, code, reportContent) {
		if (code !== 0) overallCode = code;
		collectedReports[idx] = reportContent;
		socket.emit('runner-lane-status', { id: laneId, status: code === 0 ? 'done' : 'error' });
		doneCount++;

		if (doneCount === total) {
			socket.emit('log', `\nAll runners finished (exit ${overallCode})`);
			socket.emit('done', overallCode);

			reportService
				.saveCombinedReport({
					reports: collectedReports,
					runners: laneInfos,
					overallCode,
					tag,
					triggerType: TRIGGER_TYPE.MANUAL,
					browser
				})
				.then(() => io.emit('report-ready'))
				.catch((e) => console.error('[runner] Failed to save combined report:', e.message));
		}
	}

	for (let i = 0; i < runnerIds.length; i++) {
		const lane = laneInfos[i];
		const chunkTag = chunks[i]?.length > 0 ? buildTagExpression(chunks[i]) : tag;

		if (lane.id === BUILT_IN_RUNNER_ID) {
			const env = {
				...process.env,
				TAG: chunkTag,
				TRIGGER: TRIGGER_REMOTE,
				BROWSER: browser,
				REPORT_RUNNERS: String(workers),
				PLUM_MODE: 'node'
			};
			if (workers > 1) env.PARALLEL = String(workers);

			const proc = spawn('npm', ['run', 'test'], { env, shell: true });
			activeProcs.add(proc);

			proc.stdout.on('data', (d) =>
				socket.emit('runner-lane-log', { id: lane.id, log: d.toString() })
			);
			proc.stderr.on('data', (d) =>
				socket.emit('runner-lane-log', { id: lane.id, log: `[ERROR] ${d.toString()}` })
			);

			const idx = i;
			proc.on('close', (code) => {
				activeProcs.delete(proc);
				onLaneDone(idx, lane.id, code, readCucumberReportFile());
			});
		} else {
			const idx = i;
			runnerService.dispatchAndPoll(
				lane.id,
				{ tags: chunkTag, browser, workers },
				(log) => socket.emit('runner-lane-log', { id: lane.id, log }),
				(code, content) => onLaneDone(idx, lane.id, code, content)
			);
		}
	}
}

module.exports = socketHandler;
