/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const runnerService = require('../services/runnerService');
const reportService = require('../services/reportService');
const settingsService = require('../services/settingsService');
const notificationService = require('../services/notificationService');
const activeRunsService = require('../services/activeRunsService');
const { startSsPoller } = require('../lib/screenshotPoller');
const { runWithRetries } = require('../lib/retryRunner');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID, TRIGGER_REMOTE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { PLUM_MODE_NODE } = require('../constants/env');
const { SOCKET_EVENTS } = require('../constants/socketEvents');
const { JOB_STATUS, REPORT_STATUS } = require('../constants/jobStatus');
const { getTestIdsForTag, chunkTests, buildTagExpression } = require('../lib/testChunker');
const { readCucumberReportFile } = require('../lib/reportFilename');
const { getTestSuites } = require('../services/testService');
const prisma = require('../services/prisma');

const socketHandler = (io) => {
	io.on('connection', (socket) => {
		console.log('WebSocket connection established');

		// Track processes spawned for this socket connection so we can cancel them
		const activeProcs = new Set();
		// The in-progress manual run's id started from this connection, if any — used so
		// 'cancel-test' can unregister/broadcast without a second run-id handshake.
		let currentManualRunId = null;

		socket.on(SOCKET_EVENTS.RUN_TEST, async (payload, legacyWorkers) => {
			let tag,
				workers,
				browser,
				runners,
				testRunId,
				notifyDiscord,
				notifySlack,
				runTitle,
				startedBy;
			if (typeof payload === 'string') {
				tag = payload;
				workers = Number(legacyWorkers) > 1 ? Number(legacyWorkers) : 1;
				browser = DEFAULT_BROWSER;
				runners = [BUILT_IN_RUNNER_ID];
				testRunId = null;
				notifyDiscord = false;
				notifySlack = false;
				runTitle = null;
				startedBy = null;
			} else {
				tag = payload.tag ?? '';
				workers = Number(payload.workers) > 1 ? Number(payload.workers) : 1;
				browser = payload.browser ?? DEFAULT_BROWSER;
				runners =
					Array.isArray(payload.runners) && payload.runners.length > 0
						? payload.runners
						: [BUILT_IN_RUNNER_ID];
				testRunId = payload.testRunId ?? null;
				notifyDiscord = payload.notifyDiscord === true;
				notifySlack = payload.notifySlack === true;
				runTitle = payload.runTitle ?? null;
				startedBy = payload.startedBy ?? null;
			}

			const runId = randomUUID();
			const label = runTitle || tag || 'Manual run';
			const meta = { tag, workers, browser, startedBy };
			activeRunsService.registerRun(runId, { kind: TRIGGER_TYPE.MANUAL, label, meta });
			currentManualRunId = runId;
			// Broadcast to every OTHER connected client so coworkers see this run live —
			// the initiating tab already has full detail via its own runnerState/socket.emit
			// events below, so it's deliberately excluded to avoid a duplicate bottom-bar entry.
			socket.broadcast.emit(SOCKET_EVENTS.BG_RUN_START, {
				runId,
				kind: TRIGGER_TYPE.MANUAL,
				label,
				meta
			});

			// Drop runner ids that no longer exist (e.g. a deleted runner still
			// referenced by a stale client selection) so they can't wedge the run.
			const validatedRunners = [];
			for (const id of runners) {
				if (id === BUILT_IN_RUNNER_ID || (await runnerService.getById(id))) {
					validatedRunners.push(id);
				} else {
					socket.emit(SOCKET_EVENTS.LOG, `[WARN] Runner ${id} no longer exists — skipping.\n`);
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
					notifySlack,
					runId
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
					notifySlack,
					runId
				);
			}
		});

		socket.on(SOCKET_EVENTS.CANCEL_TEST, () => {
			if (activeProcs.size === 0) return;
			for (const proc of activeProcs) {
				try {
					proc.kill('SIGTERM');
				} catch {}
			}
			activeProcs.clear();
			socket.emit(SOCKET_EVENTS.LOG, '\n[CANCELLED] Test run cancelled by user.\n');
			socket.emit(SOCKET_EVENTS.DONE, 130);
			if (currentManualRunId) {
				finishManualRun(socket, currentManualRunId, 130);
				currentManualRunId = null;
			}
		});
	});
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function finishManualRun(socket, runId, code, reportId) {
	// unregisterRun returns false if this runId was already unregistered (e.g. a cancel
	// already fired) — skip the broadcast so a cancelled-then-still-completing run doesn't
	// send two conflicting bg-run-done events to every other connected client.
	if (!activeRunsService.unregisterRun(runId)) return;
	socket.broadcast.emit(SOCKET_EVENTS.BG_RUN_DONE, { runId, code, reportId: reportId ?? null });
}

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

/**
 * Spawns one `npm run test` attempt for the built-in (local) runner and
 * resolves once it exits. When `suppressSave` is set, PLUM_MODE=node is
 * forced so generate-report.js skips its own DB save — used by the retry
 * path, which persists exactly one merged report itself once every attempt
 * is done, instead of one row per attempt.
 */
function runBuiltInAttempt({
	activeProcs,
	socket,
	currentTag,
	workers,
	browser,
	testRunId,
	suppressSave,
	onLog
}) {
	return new Promise((resolve) => {
		const ssDir = path.join(os.tmpdir(), `plum-ss-${Date.now()}`);
		fs.mkdirSync(ssDir, { recursive: true });

		const env = {
			...process.env,
			TAG: currentTag,
			TRIGGER: TRIGGER_TYPE.MANUAL,
			REPORT_RUNNERS: String(workers),
			BROWSER: browser,
			PLUM_SS_DIR: ssDir
		};
		if (workers > 1) env.PARALLEL = String(workers);
		if (testRunId) env.TEST_RUN_ID = testRunId;
		if (suppressSave) env.PLUM_MODE = PLUM_MODE_NODE;

		const proc = spawn('npm', ['run', 'test'], { env, shell: true });
		activeProcs.add(proc);

		const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
			socket.emit(SOCKET_EVENTS.STEP_SCREENSHOT, { stepName, data });
		});

		proc.stdout.on('data', (d) => onLog(d.toString()));
		proc.stderr.on('data', (d) => onLog(`[ERROR] ${d.toString()}`));

		proc.on('close', (code) => {
			clearInterval(ssPoller);
			fs.rm(ssDir, { recursive: true, force: true }, () => {});
			activeProcs.delete(proc);
			resolve({ code, raw: suppressSave ? readCucumberReportFile() : null });
		});
	});
}

async function runBuiltIn(
	io,
	socket,
	activeProcs,
	tag,
	workers,
	browser,
	testRunId,
	notifyDiscord,
	notifySlack,
	runId
) {
	const startedAt = Date.now();
	const { maxRetries } = await settingsService.getProject();

	let logBuffer = '';
	const onLog = (text) => {
		logBuffer += text;
		socket.emit(SOCKET_EVENTS.LOG, text);
	};

	if (maxRetries === 0) {
		const { code } = await runBuiltInAttempt({
			activeProcs,
			socket,
			currentTag: tag,
			workers,
			browser,
			testRunId,
			suppressSave: false,
			onLog
		});
		socket.emit(SOCKET_EVENTS.LOG, `\nTest finished with code ${code}`);
		socket.emit(SOCKET_EVENTS.DONE, code);
		io.emit(SOCKET_EVENTS.REPORT_READY);
		finishManualRun(socket, runId, code, null);

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
					data: { logs: logBuffer || null, duration: Date.now() - startedAt }
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
		return;
	}

	const { code, rawJson, attempts } = await runWithRetries({
		maxRetries,
		spawnAttempt: async (tagOverride) => {
			const { code, raw } = await runBuiltInAttempt({
				activeProcs,
				socket,
				currentTag: tagOverride ?? tag,
				workers,
				browser,
				testRunId,
				suppressSave: true,
				onLog
			});
			return { code, rawJson: raw ? JSON.parse(raw) : [] };
		},
		onLog
	});

	socket.emit(SOCKET_EVENTS.LOG, `\nTest finished with code ${code}`);

	const report = await reportService.saveReport({
		rawCucumberJson: rawJson,
		tags: tag,
		triggerType: TRIGGER_TYPE.MANUAL,
		browser,
		testRunId: testRunId ?? null,
		logs: logBuffer || null,
		duration: Date.now() - startedAt,
		attempts
	});

	socket.emit(SOCKET_EVENTS.DONE, code);
	io.emit(SOCKET_EVENTS.REPORT_READY);
	finishManualRun(socket, runId, code, report.id);

	if (notifyDiscord || notifySlack) {
		notificationService
			.send({
				jobName: 'Manual Run',
				status: report.status,
				content: report.content,
				browser,
				tags: tag,
				reportId: report.id,
				notifyDiscord,
				notifySlack
			})
			.catch((e) => console.error(`[socket] Notification failed: ${e.message}`));
	}
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
	notifySlack,
	runId
) {
	const dispatchStartedAt = Date.now();
	const { maxRetries } = await settingsService.getProject();
	const allIds = getTestIdsForTag(tag);
	const chunks = chunkTests(allIds, runnerIds.length);

	// Surplus runners beyond the number of non-empty chunks would fall back to
	// running the full tag expression, producing duplicate scenarios in the report.
	const activeRunnerIds = runnerIds.slice(0, chunks.length);

	if (activeRunnerIds.length === 0) {
		socket.emit(SOCKET_EVENTS.LOG, '\nNo tests found matching the selected tag.\n');
		socket.emit(SOCKET_EVENTS.DONE, 0);
		finishManualRun(socket, runId, 0, null);
		return;
	}

	if (activeRunnerIds.length < runnerIds.length) {
		const skipped = runnerIds.length - activeRunnerIds.length;
		socket.emit(
			SOCKET_EVENTS.LOG,
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
		SOCKET_EVENTS.RUNNER_LANES_INIT,
		laneInfos.map((l, i) => ({ id: l.id, name: l.name, testCount: chunks[i].length }))
	);

	const total = activeRunnerIds.length;
	const collectedReports = new Array(total).fill(null);
	const laneAttempts = new Array(total).fill(null);
	const laneLogs = {};
	for (const l of laneInfos) laneLogs[l.id] = '';
	let doneCount = 0;
	let overallCode = 0;

	function onLaneDone(idx, laneId, code, reportContent, attempts = null) {
		if (code !== 0) overallCode = code;
		collectedReports[idx] = reportContent;
		laneAttempts[idx] = attempts;
		socket.emit(SOCKET_EVENTS.RUNNER_LANE_STATUS, {
			id: laneId,
			status: code === 0 ? JOB_STATUS.DONE : JOB_STATUS.ERROR
		});
		doneCount++;

		if (doneCount === total) {
			socket.emit(SOCKET_EVENTS.LOG, `\nAll runners finished (exit ${overallCode})`);

			reportService
				.saveCombinedReport({
					reports: collectedReports,
					runners: laneInfos,
					overallCode,
					tag,
					triggerType: TRIGGER_TYPE.MANUAL,
					browser,
					testRunId: testRunId ?? null,
					laneLogs,
					duration: Date.now() - dispatchStartedAt,
					attemptsByLane: laneAttempts
				})
				.then((saved) => {
					// Result is authoritative from the merged report, not the exit code —
					// a node's non-test failure (e.g. a failed report fetch) must not flip
					// a passing run to "fail" in the live UI.
					socket.emit(SOCKET_EVENTS.DONE, {
						code: saved.status === REPORT_STATUS.PASS ? 0 : 1,
						reportId: saved.id
					});
					io.emit(SOCKET_EVENTS.REPORT_READY);
					finishManualRun(socket, runId, saved.status === REPORT_STATUS.PASS ? 0 : 1, saved.id);

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
					socket.emit(SOCKET_EVENTS.DONE, { code: overallCode, reportId: null });
					finishManualRun(socket, runId, overallCode, null);
				});
		}
	}

	for (let i = 0; i < activeRunnerIds.length; i++) {
		const lane = laneInfos[i];
		const chunkTag = buildTagExpression(chunks[i]);
		const chunkIds = chunks[i];

		if (lane.id === BUILT_IN_RUNNER_ID) {
			const idx = i;
			const laneId = lane.id;
			const onLog = (text) => {
				laneLogs[laneId] += text;
				socket.emit(SOCKET_EVENTS.RUNNER_LANE_LOG, { id: laneId, log: text });
			};

			const spawnBuiltInLaneAttempt = (currentTag) =>
				new Promise((resolve) => {
					const ssDir = path.join(os.tmpdir(), `plum-ss-${Date.now()}-${idx}`);
					fs.mkdirSync(ssDir, { recursive: true });

					const env = {
						...process.env,
						TAG: currentTag,
						TRIGGER: TRIGGER_REMOTE,
						BROWSER: browser,
						REPORT_RUNNERS: String(workers),
						PLUM_MODE: PLUM_MODE_NODE,
						PLUM_SS_DIR: ssDir
					};
					if (workers > 1) env.PARALLEL = String(workers);

					const proc = spawn('npm', ['run', 'test'], { env, shell: true });
					activeProcs.add(proc);

					const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
						socket.emit(SOCKET_EVENTS.RUNNER_LANE_SCREENSHOT, { id: laneId, stepName, data });
					});

					proc.stdout.on('data', (d) => onLog(d.toString()));
					proc.stderr.on('data', (d) => onLog(`[ERROR] ${d.toString()}`));

					proc.on('close', (code) => {
						clearInterval(ssPoller);
						fs.rm(ssDir, { recursive: true, force: true }, () => {});
						activeProcs.delete(proc);
						const content =
							readCucumberReportFile() ??
							makeSyntheticFailReport(lane.name, chunkIds, 'process exited with error');
						resolve({ code, rawJson: JSON.parse(content) });
					});
				});

			runWithRetries({
				maxRetries,
				spawnAttempt: (t) => spawnBuiltInLaneAttempt(t ?? chunkTag),
				onLog
			}).then(({ code, rawJson, attempts }) =>
				onLaneDone(idx, laneId, code, JSON.stringify(rawJson), attempts)
			);
		} else {
			const idx = i;
			const laneId = lane.id;
			const onLog = (log) => {
				laneLogs[laneId] += log;
				socket.emit(SOCKET_EVENTS.RUNNER_LANE_LOG, { id: laneId, log });
			};

			const spawnRemoteLaneAttempt = (currentTag) =>
				new Promise((resolve) => {
					runnerService.dispatchAndPoll(
						laneId,
						{ tags: currentTag, browser, workers },
						onLog,
						(code, content) => {
							const raw =
								content ??
								makeSyntheticFailReport(lane.name, chunkIds, 'could not fetch report from runner');
							resolve({ code, rawJson: JSON.parse(raw) });
						},
						({ stepName, data }) => {
							socket.emit(SOCKET_EVENTS.RUNNER_LANE_SCREENSHOT, { id: laneId, stepName, data });
						}
					);
				});

			runWithRetries({
				maxRetries,
				spawnAttempt: (t) => spawnRemoteLaneAttempt(t ?? chunkTag),
				onLog
			}).then(({ code, rawJson, attempts }) =>
				onLaneDone(idx, laneId, code, JSON.stringify(rawJson), attempts)
			);
		}
	}
}

module.exports = socketHandler;
