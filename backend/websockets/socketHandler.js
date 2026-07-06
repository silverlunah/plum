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
const fs = require('fs');
const os = require('os');
const path = require('path');
const runnerService = require('../services/runnerService');
const reportService = require('../services/reportService');
const notificationService = require('../services/notificationService');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID, TRIGGER_REMOTE } = require('../constants/triggers');
const { getTestIdsForTag, chunkTests, buildTagExpression } = require('../lib/testChunker');
const { readCucumberReportFile } = require('../lib/reportFilename');
const { getTestSuites } = require('../services/testService');
const prisma = require('../services/prisma');

const socketHandler = (io) => {
	io.on('connection', (socket) => {
		console.log('WebSocket connection established');

		// Track processes spawned for this socket connection so we can cancel them
		const activeProcs = new Set();

		socket.on('run-test', async (payload, legacyWorkers) => {
			let tag, workers, browser, runners, testRunId, notifyDiscord, notifySlack;
			if (typeof payload === 'string') {
				tag = payload;
				workers = Number(legacyWorkers) > 1 ? Number(legacyWorkers) : 1;
				browser = 'chromium';
				runners = [BUILT_IN_RUNNER_ID];
				testRunId = null;
				notifyDiscord = false;
				notifySlack = false;
			} else {
				tag = payload.tag ?? '';
				workers = Number(payload.workers) > 1 ? Number(payload.workers) : 1;
				browser = payload.browser ?? 'chromium';
				runners =
					Array.isArray(payload.runners) && payload.runners.length > 0
						? payload.runners
						: [BUILT_IN_RUNNER_ID];
				testRunId = payload.testRunId ?? null;
				notifyDiscord = payload.notifyDiscord === true;
				notifySlack = payload.notifySlack === true;
			}

			// Drop runner ids that no longer exist (e.g. a deleted runner still
			// referenced by a stale client selection) so they can't wedge the run.
			const validatedRunners = [];
			for (const id of runners) {
				if (id === BUILT_IN_RUNNER_ID || (await runnerService.getById(id))) {
					validatedRunners.push(id);
				} else {
					socket.emit('log', `[WARN] Runner ${id} no longer exists — skipping.\n`);
				}
			}
			runners = validatedRunners.length > 0 ? validatedRunners : [BUILT_IN_RUNNER_ID];

			const isSingleBuiltIn = runners.length === 1 && runners[0] === BUILT_IN_RUNNER_ID;

			if (isSingleBuiltIn) {
				runBuiltIn(
					io,
					socket,
					activeProcs,
					tag,
					workers,
					browser,
					testRunId,
					notifyDiscord,
					notifySlack
				);
			} else {
				runDistributed(
					io,
					socket,
					activeProcs,
					tag,
					workers,
					browser,
					runners,
					testRunId,
					notifyDiscord,
					notifySlack
				);
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
// Helpers
// ---------------------------------------------------------------------------

function makeSyntheticFailReport(laneName, testIds, reason) {
	// Build id → scenario title from local feature files so names match the real report.
	const nameMap = {};
	try {
		const { suites } = getTestSuites();
		for (const suite of suites) {
			for (const test of suite.tests) {
				for (const id of Array.isArray(test.id) ? test.id : [test.id]) {
					nameMap[id] = test.testCase;
				}
			}
		}
	} catch {}

	return JSON.stringify([
		{
			id: 'runner-error',
			uri: 'runner-error',
			name: `Runner: ${laneName}`,
			keyword: 'Feature',
			elements: testIds.map((id) => ({
				id: id.replace(/^@/, '').toLowerCase(),
				// Use real scenario title; fall back to bare ID without @
				name: nameMap[id] || id.replace(/^@/, ''),
				keyword: 'Scenario',
				type: 'scenario',
				// ids from getTestIdsForTag already carry the @ — don't add a second one
				tags: [{ name: id.startsWith('@') ? id : `@${id}` }],
				steps: [
					{
						keyword: 'Given ',
						name: 'the scenario was assigned to this runner',
						result: {
							status: 'failed',
							error_message: `Runner "${laneName}" did not complete: ${reason}`,
							duration: 0
						}
					}
				]
			}))
		}
	]);
}

// ---------------------------------------------------------------------------
// Single built-in runner
// ---------------------------------------------------------------------------

function startSsPoller(ssDir, onScreenshot) {
	const seenFiles = new Set();
	return setInterval(() => {
		try {
			const files = fs
				.readdirSync(ssDir)
				.filter((f) => f.endsWith('.ss.json'))
				.sort();
			for (const f of files) {
				if (seenFiles.has(f)) continue;
				seenFiles.add(f);
				const filePath = path.join(ssDir, f);
				const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				onScreenshot(data);
				try {
					fs.unlinkSync(filePath);
				} catch {}
			}
		} catch {}
	}, 400);
}

function runBuiltIn(
	io,
	socket,
	activeProcs,
	tag,
	workers,
	browser,
	testRunId,
	notifyDiscord,
	notifySlack
) {
	const ssDir = path.join(os.tmpdir(), `plum-ss-${Date.now()}`);
	fs.mkdirSync(ssDir, { recursive: true });

	const env = {
		...process.env,
		TAG: tag,
		TRIGGER: TRIGGER_TYPE.MANUAL,
		REPORT_RUNNERS: String(workers),
		BROWSER: browser,
		PLUM_SS_DIR: ssDir
	};
	if (workers > 1) env.PARALLEL = String(workers);
	if (testRunId) env.TEST_RUN_ID = testRunId;

	const proc = spawn('npm', ['run', 'test'], { env, shell: true });
	activeProcs.add(proc);

	const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
		socket.emit('step-screenshot', { stepName, data });
	});

	let logBuffer = '';
	proc.stdout.on('data', (d) => {
		const text = d.toString();
		logBuffer += text;
		socket.emit('log', text);
	});
	proc.stderr.on('data', (d) => {
		const text = `[ERROR] ${d.toString()}`;
		logBuffer += text;
		socket.emit('log', text);
	});

	proc.on('close', async (code) => {
		clearInterval(ssPoller);
		fs.rm(ssDir, { recursive: true, force: true }, () => {});
		activeProcs.delete(proc);
		socket.emit('log', `\nTest finished with code ${code}`);
		socket.emit('done', code);
		io.emit('report-ready');

		// Attach accumulated logs to the report generate-report.js just saved
		try {
			const latest = await prisma.report.findFirst({
				where: { triggerType: TRIGGER_TYPE.MANUAL },
				orderBy: { createdAt: 'desc' },
				select: { id: true }
			});
			if (latest) {
				await prisma.report.update({
					where: { id: latest.id },
					data: { logs: logBuffer || null }
				});
			}
		} catch (e) {
			console.error('[socket] Failed to save run logs:', e.message);
		}

		if (notifyDiscord || notifySlack) {
			prisma.report
				.findFirst({
					where: { triggerType: TRIGGER_TYPE.MANUAL },
					orderBy: { createdAt: 'desc' },
					select: { id: true, status: true, content: true }
				})
				.then((report) => {
					if (!report) return;
					return notificationService.send({
						jobName: 'Manual Run',
						status: report.status,
						content: report.content,
						browser,
						tags: tag,
						reportId: report.id,
						notifyDiscord,
						notifySlack
					});
				})
				.catch((e) => console.error(`[socket] Notification failed: ${e.message}`));
		}
	});
}

// ---------------------------------------------------------------------------
// Distributed (multi-runner) path
// ---------------------------------------------------------------------------

async function runDistributed(
	io,
	socket,
	activeProcs,
	tag,
	workers,
	browser,
	runnerIds,
	testRunId,
	notifyDiscord,
	notifySlack
) {
	const allIds = getTestIdsForTag(tag);
	const chunks = chunkTests(allIds, runnerIds.length);

	// Surplus runners beyond the number of non-empty chunks would fall back to
	// running the full tag expression, producing duplicate scenarios in the report.
	const activeRunnerIds = runnerIds.slice(0, chunks.length);

	if (activeRunnerIds.length === 0) {
		socket.emit('log', '\nNo tests found matching the selected tag.\n');
		socket.emit('done', 0);
		return;
	}

	if (activeRunnerIds.length < runnerIds.length) {
		const skipped = runnerIds.length - activeRunnerIds.length;
		socket.emit(
			'log',
			`[INFO] ${skipped} runner(s) not used — fewer tests than runners selected.\n`
		);
	}

	const laneInfos = await Promise.all(
		activeRunnerIds.map(async (id) => {
			if (id === BUILT_IN_RUNNER_ID) return { id, name: 'Built-in', dbId: null };
			const r = await runnerService.getById(id);
			return { id, name: r?.name ?? id, dbId: r?.id ?? null };
		})
	);

	socket.emit(
		'runner-lanes-init',
		laneInfos.map((l, i) => ({ id: l.id, name: l.name, testCount: chunks[i].length }))
	);

	const total = activeRunnerIds.length;
	const collectedReports = new Array(total).fill(null);
	const laneLogs = {};
	for (const l of laneInfos) laneLogs[l.id] = '';
	let doneCount = 0;
	let overallCode = 0;

	function onLaneDone(idx, laneId, code, reportContent) {
		if (code !== 0) overallCode = code;
		collectedReports[idx] = reportContent;
		socket.emit('runner-lane-status', { id: laneId, status: code === 0 ? 'done' : 'error' });
		doneCount++;

		if (doneCount === total) {
			socket.emit('log', `\nAll runners finished (exit ${overallCode})`);

			reportService
				.saveCombinedReport({
					reports: collectedReports,
					runners: laneInfos,
					overallCode,
					tag,
					triggerType: TRIGGER_TYPE.MANUAL,
					browser,
					testRunId: testRunId ?? null,
					laneLogs
				})
				.then((saved) => {
					// Result is authoritative from the merged report, not the exit code —
					// a node's non-test failure (e.g. a failed report fetch) must not flip
					// a passing run to "fail" in the live UI.
					socket.emit('done', { code: saved.status === 'PASS' ? 0 : 1, reportId: saved.id });
					io.emit('report-ready');

					if (notifyDiscord || notifySlack) {
						notificationService
							.send({
								jobName: 'Manual Run',
								status: saved.status,
								content: saved.content,
								browser,
								tags: tag,
								reportId: saved.id,
								notifyDiscord,
								notifySlack
							})
							.catch((e) => console.error(`[socket] Notification failed: ${e.message}`));
					}
				})
				.catch((e) => {
					console.error('[runner] Failed to save combined report:', e.message);
					socket.emit('done', { code: overallCode, reportId: null });
				});
		}
	}

	for (let i = 0; i < activeRunnerIds.length; i++) {
		const lane = laneInfos[i];
		const chunkTag = buildTagExpression(chunks[i]);
		const chunkIds = chunks[i];

		if (lane.id === BUILT_IN_RUNNER_ID) {
			const laneId = lane.id;
			const ssDir = path.join(os.tmpdir(), `plum-ss-${Date.now()}-${i}`);
			fs.mkdirSync(ssDir, { recursive: true });

			const env = {
				...process.env,
				TAG: chunkTag,
				TRIGGER: TRIGGER_REMOTE,
				BROWSER: browser,
				REPORT_RUNNERS: String(workers),
				PLUM_MODE: 'node',
				PLUM_SS_DIR: ssDir
			};
			if (workers > 1) env.PARALLEL = String(workers);

			const proc = spawn('npm', ['run', 'test'], { env, shell: true });
			activeProcs.add(proc);

			const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
				socket.emit('runner-lane-screenshot', { id: laneId, stepName, data });
			});

			proc.stdout.on('data', (d) => {
				const text = d.toString();
				laneLogs[laneId] += text;
				socket.emit('runner-lane-log', { id: laneId, log: text });
			});
			proc.stderr.on('data', (d) => {
				const text = `[ERROR] ${d.toString()}`;
				laneLogs[laneId] += text;
				socket.emit('runner-lane-log', { id: laneId, log: text });
			});

			const idx = i;
			proc.on('close', (code) => {
				clearInterval(ssPoller);
				fs.rm(ssDir, { recursive: true, force: true }, () => {});
				activeProcs.delete(proc);
				const content =
					readCucumberReportFile() ??
					makeSyntheticFailReport(lane.name, chunkIds, 'process exited with error');
				onLaneDone(idx, laneId, code, content);
			});
		} else {
			const idx = i;
			const laneId = lane.id;
			runnerService.dispatchAndPoll(
				laneId,
				{ tags: chunkTag, browser, workers },
				(log) => {
					laneLogs[laneId] += log;
					socket.emit('runner-lane-log', { id: laneId, log });
				},
				(code, content) =>
					onLaneDone(
						idx,
						laneId,
						code,
						content ??
							makeSyntheticFailReport(lane.name, chunkIds, 'could not fetch report from runner')
					),
				({ stepName, data }) => {
					socket.emit('runner-lane-screenshot', { id: laneId, stepName, data });
				}
			);
		}
	}
}

module.exports = socketHandler;
