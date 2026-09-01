/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runnerService = require('./runnerService');
const reportService = require('./reportService');
const settingsService = require('./settingsService');
const notificationService = require('./notificationService');
const { startRRwebPoller } = require('../lib/rrwebPoller');
const { runWithRetries } = require('../lib/retryRunner');
const { BUILT_IN_RUNNER_ID, TRIGGER_REMOTE } = require('../constants/triggers');
const { PLUM_MODE_NODE } = require('../constants/env');
const { SOCKET_EVENTS } = require('../constants/socketEvents');
const { JOB_STATUS, REPORT_STATUS, CANCEL_CODE } = require('../constants/jobStatus');
const { getTestIdsForTag, chunkTests, buildTagExpression } = require('../lib/testChunker');
const { getTestSuites } = require('./testService');
const { resolveTestsRoot, loadProjectEnv } = require('../lib/testsRoot');
const { ensureProjectDeps } = require('../lib/projectDeps');
const { readCucumberReportFile } = require('../lib/reportFilename');

const BACKEND_DIR = path.resolve(__dirname, '..');

// runId → live handles, so cancel() can stop every process and remote job a run owns.
const inflight = new Map();

function handles(runId) {
	let rec = inflight.get(runId);
	if (!rec) {
		rec = { procs: new Set(), remoteJobs: [], cancelled: false };
		inflight.set(runId, rec);
	}
	return rec;
}

function isCancelled(runId) {
	return inflight.get(runId)?.cancelled === true;
}

/** Best-effort stop of everything a run owns — local child processes and remote node jobs. */
async function cancel(runId) {
	const rec = inflight.get(runId);
	if (!rec) return false;
	rec.cancelled = true;
	for (const proc of rec.procs) {
		try {
			proc.kill('SIGTERM');
		} catch {}
	}
	await Promise.allSettled(
		rec.remoteJobs.map(({ runnerId, jobId }) => runnerService.cancelRemoteJob(runnerId, jobId))
	);
	return true;
}

// Stand-in Cucumber JSON for a lane that never produced a real report (process
// crashed, node unreachable) so its scenarios still show as failed by name
// instead of silently vanishing from the combined report.
function makeSyntheticFailReport(projectId, laneName, testIds, reason) {
	const nameMap = {};
	try {
		const { suites } = getTestSuites(projectId);
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
				name: nameMap[id] || id.replace(/^@/, ''),
				keyword: 'Scenario',
				type: 'scenario',
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
// Built-in (local) attempt
// ---------------------------------------------------------------------------

// Always spawned with PLUM_MODE=node so generate-report.js skips its own DB
// write — this service persists exactly one report per run itself. The queue
// serialises every run that targets the built-in runner, so the shared
// reports/cucumber_report.json is never contended.
function spawnBuiltInAttempt({
	runId,
	projectId,
	laneId,
	tag,
	workers,
	browser,
	testRunId,
	baseUrl,
	onLog,
	io
}) {
	return new Promise((resolve) => {
		ensureProjectDeps(projectId, { onLog });

		const ssDir = path.join(os.tmpdir(), `plum-ss-${runId}-${laneId}-${Date.now()}`);
		fs.mkdirSync(ssDir, { recursive: true });

		const env = {
			...process.env,
			...loadProjectEnv(projectId),
			IS_HEADLESS: 'true', // server runs have no display — never headed
			TAG: tag,
			TRIGGER: TRIGGER_REMOTE,
			BROWSER: browser,
			REPORT_RUNNERS: String(workers),
			PLUM_MODE: PLUM_MODE_NODE,
			PLUM_SS_DIR: ssDir,
			TESTS_ROOT: resolveTestsRoot(projectId),
			PLUM_PROJECT_ID: String(projectId)
		};
		if (Number(workers) > 1) env.PARALLEL = String(workers);
		if (testRunId) env.TEST_RUN_ID = testRunId;
		if (baseUrl) env.BASE_URL = baseUrl;

		const proc = spawn('npm', ['run', 'test'], { env, shell: true, cwd: BACKEND_DIR });
		handles(runId).procs.add(proc);

		const ssPoller = startRRwebPoller(ssDir, (batch) => {
			io && io.emit(SOCKET_EVENTS.BG_RUN_LANE_RRWEB_BATCH, { runId, id: laneId, ...batch });
		});

		proc.stdout.on('data', (d) => onLog(d.toString()));
		proc.stderr.on('data', (d) => onLog(`[ERROR] ${d.toString()}`));

		proc.on('close', (code) => {
			ssPoller.stop();
			fs.rm(ssDir, { recursive: true, force: true }, () => {});
			handles(runId).procs.delete(proc);
			resolve({ code, raw: readCucumberReportFile() });
		});
	});
}

// ---------------------------------------------------------------------------
// Single built-in runner
// ---------------------------------------------------------------------------

async function runBuiltIn(run, io, emit) {
	const startedAt = Date.now();
	const { maxRetries } = await settingsService.getProject(run.projectId);
	const laneId = BUILT_IN_RUNNER_ID;

	let logBuffer = '';
	const onLog = (text) => {
		logBuffer += text;
		emit(SOCKET_EVENTS.BG_RUN_LANE_LOG, { laneId, log: text });
	};

	emit(SOCKET_EVENTS.BG_RUN_LANES_INIT, {
		lanes: [
			{ id: laneId, name: 'Built-in', testCount: getTestIdsForTag(run.projectId, run.tag).length }
		]
	});

	const { code, rawJson, attempts } = await runWithRetries({
		maxRetries,
		spawnAttempt: async (tagOverride) => {
			const { code, raw } = await spawnBuiltInAttempt({
				runId: run.id,
				projectId: run.projectId,
				laneId,
				tag: tagOverride ?? run.tag,
				workers: run.workers,
				browser: run.browser,
				testRunId: run.testRunId,
				baseUrl: run.baseUrl,
				onLog,
				io
			});
			return { code, rawJson: raw ? JSON.parse(raw) : [] };
		},
		onLog
	});

	const cancelled = isCancelled(run.id) || code === CANCEL_CODE;
	emit(SOCKET_EVENTS.BG_RUN_LANE_STATUS, {
		laneId,
		status: cancelled ? JOB_STATUS.CANCELLED : code === 0 ? JOB_STATUS.DONE : JOB_STATUS.ERROR
	});

	if (cancelled) return { code: CANCEL_CODE, reportId: null };

	const report = await reportService.saveReport({
		projectId: run.projectId,
		rawCucumberJson: rawJson,
		tags: run.tag,
		triggerType: run.triggerType,
		startedBy: run.startedBy ?? null,
		workerCount: run.workers,
		browser: run.browser,
		testRunId: run.testRunId ?? null,
		logs: logBuffer || null,
		duration: Date.now() - startedAt,
		attempts
	});

	io && io.emit(SOCKET_EVENTS.REPORT_READY);
	await maybeNotify(run, report);
	return { code: report.status === REPORT_STATUS.PASS ? 0 : 1, reportId: report.id };
}

// ---------------------------------------------------------------------------
// Distributed (multi-runner) path
// ---------------------------------------------------------------------------

async function runDistributed(run, io, emit, laneInfos, chunks) {
	const startedAt = Date.now();
	const { maxRetries } = await settingsService.getProject(run.projectId);

	emit(SOCKET_EVENTS.BG_RUN_LANES_INIT, {
		lanes: laneInfos.map((l, i) => ({ id: l.id, name: l.name, testCount: chunks[i].length }))
	});

	const total = laneInfos.length;
	const collectedReports = new Array(total).fill(null);
	const laneAttempts = new Array(total).fill(null);
	const laneLogs = {};
	for (const l of laneInfos) laneLogs[l.id] = '';

	const laneResults = await Promise.all(
		laneInfos.map((lane, i) => runLane(run, io, emit, lane, chunks[i], maxRetries, laneLogs))
	);

	let overallCode = 0;
	laneResults.forEach((res, i) => {
		if (res.code !== 0) overallCode = res.code;
		collectedReports[i] = res.content;
		laneAttempts[i] = res.attempts;
		emit(SOCKET_EVENTS.BG_RUN_LANE_STATUS, {
			laneId: laneInfos[i].id,
			status: res.code === 0 ? JOB_STATUS.DONE : JOB_STATUS.ERROR
		});
	});

	if (isCancelled(run.id)) return { code: CANCEL_CODE, reportId: null };

	const saved = await reportService.saveCombinedReport({
		projectId: run.projectId,
		reports: collectedReports,
		runners: laneInfos,
		workers: run.workers,
		overallCode,
		tag: run.tag,
		triggerType: run.triggerType,
		startedBy: run.startedBy ?? null,
		browser: run.browser,
		testRunId: run.testRunId ?? null,
		laneLogs,
		duration: Date.now() - startedAt,
		attemptsByLane: laneAttempts
	});

	io && io.emit(SOCKET_EVENTS.REPORT_READY);
	await maybeNotify(run, saved);
	return { code: saved.status === REPORT_STATUS.PASS ? 0 : 1, reportId: saved.id };
}

function runLane(run, io, emit, lane, chunkIds, maxRetries, laneLogs) {
	const laneId = lane.id;
	const chunkTag = buildTagExpression(chunkIds);
	const onLog = (log) => {
		laneLogs[laneId] += log;
		emit(SOCKET_EVENTS.BG_RUN_LANE_LOG, { laneId, log });
	};

	const attempt =
		lane.id === BUILT_IN_RUNNER_ID
			? (currentTag) =>
					spawnBuiltInAttempt({
						runId: run.id,
						projectId: run.projectId,
						laneId,
						tag: currentTag,
						workers: run.workers,
						browser: run.browser,
						testRunId: run.testRunId,
						baseUrl: run.baseUrl,
						onLog,
						io
					}).then(({ code, raw }) => ({
						code,
						rawJson: JSON.parse(
							raw ??
								makeSyntheticFailReport(
									run.projectId,
									lane.name,
									chunkIds,
									'process exited with error'
								)
						)
					}))
			: (currentTag) =>
					new Promise((resolve) => {
						runnerService.dispatchAndPoll(
							laneId,
							{
								projectId: run.projectId,
								tags: currentTag,
								browser: run.browser,
								workers: run.workers,
								baseUrl: run.baseUrl
							},
							onLog,
							(code, content) =>
								resolve({
									code,
									rawJson: JSON.parse(
										content ??
											makeSyntheticFailReport(
												run.projectId,
												lane.name,
												chunkIds,
												'could not fetch report from runner'
											)
									)
								}),
							(batch) =>
								io &&
								io.emit(SOCKET_EVENTS.BG_RUN_LANE_RRWEB_BATCH, {
									runId: run.id,
									id: laneId,
									...batch
								}),
							(jobId) => handles(run.id).remoteJobs.push({ runnerId: laneId, jobId }),
							() => isCancelled(run.id)
						);
					});

	return runWithRetries({
		maxRetries,
		spawnAttempt: (t) => attempt(t ?? chunkTag),
		onLog
	}).then(({ code, rawJson, attempts }) => ({
		code,
		content: JSON.stringify(rawJson),
		attempts
	}));
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

async function maybeNotify(run, report) {
	if (!report || (!run.notifyDiscord && !run.notifySlack)) return;
	try {
		await notificationService.send({
			projectId: run.projectId,
			jobName: run.label,
			status: report.status,
			content: report.content,
			browser: run.browser,
			tags: run.tag,
			reportId: report.id,
			notifyDiscord: run.notifyDiscord,
			notifySlack: run.notifySlack
		});
	} catch (e) {
		console.error(`[run-executor] Notification failed: ${e.message}`);
	}
}

// Runs one queued job (a plain RunQueue row) to completion and resolves with
// { code, reportId, note? }. Takes only plain fields — no closure — so the queue
// can re-dispatch a persisted row after a server restart.
async function execute(run, io) {
	handles(run.id); // register before any await so an early cancel is seen

	// Log / rrweb streams (app output, DOM recordings) go only to this run's
	// project room, never the global broadcast.
	const roomIo = io
		? { emit: (event, payload) => io.to(`project:${run.projectId}`).emit(event, payload) }
		: null;
	const emit = (event, extra) => roomIo && roomIo.emit(event, { runId: run.id, ...extra });

	// Drop runner ids that no longer exist — a stale selection or a runner
	// deleted while this job sat in the queue must not wedge it.
	const validated = [];
	for (const id of run.runnerIds) {
		if (id === BUILT_IN_RUNNER_ID || (await runnerService.getById(id))) validated.push(id);
	}
	if (validated.length === 0) {
		return { code: 0, reportId: null, note: 'Target runner no longer exists — run skipped.' };
	}

	// Coarse start signal stays global for the cross-project run bar; the client
	// redacts it for projects the viewer can't open.
	if (io) {
		io.emit(SOCKET_EVENTS.BG_RUN_START, {
			runId: run.id,
			projectId: run.projectId,
			projectName: run.projectName ?? '',
			kind: run.kind,
			label: run.label,
			meta: {
				tag: run.tag,
				workers: run.workers,
				browser: run.browser,
				startedBy: run.startedBy ?? null
			}
		});
	}

	try {
		const isSingleBuiltIn = validated.length === 1 && validated[0] === BUILT_IN_RUNNER_ID;
		if (isSingleBuiltIn) return await runBuiltIn(run, roomIo, emit);

		const allIds = getTestIdsForTag(run.projectId, run.tag);
		const chunks = chunkTests(allIds, validated.length);
		// Surplus runners beyond the non-empty chunk count would each re-run the
		// full tag expression and duplicate scenarios — drop them.
		const activeIds = validated.slice(0, chunks.length);
		if (activeIds.length === 0) {
			emit(SOCKET_EVENTS.BG_RUN_LOG, { log: 'No tests found matching the selected tag.\n' });
			return { code: 0, reportId: null, note: 'No tests matched — run skipped.' };
		}
		const laneInfos = await Promise.all(
			activeIds.map(async (id) => {
				if (id === BUILT_IN_RUNNER_ID) return { id, name: 'Built-in', dbId: null };
				const r = await runnerService.getById(id);
				return { id, name: r?.name ?? id, dbId: r?.id ?? null };
			})
		);
		return await runDistributed(run, roomIo, emit, laneInfos, chunks);
	} finally {
		inflight.delete(run.id);
	}
}

module.exports = { execute, cancel, isCancelled };
