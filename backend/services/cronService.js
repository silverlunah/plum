/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const prisma = require('./prisma');
const runnerService = require('./runnerService');
const reportService = require('./reportService');
const settingsService = require('./settingsService');
const notificationService = require('./notificationService');
const activeRunsService = require('./activeRunsService');
const { startSsPoller } = require('../lib/screenshotPoller');
const { BUILT_IN_RUNNER_ID, TRIGGER_REMOTE, TRIGGER_TYPE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { PLUM_MODE_NODE } = require('../constants/env');
const { SOCKET_EVENTS } = require('../constants/socketEvents');
const { JOB_STATUS } = require('../constants/jobStatus');
const { getTestIdsForTag, chunkTests, buildTagExpression } = require('../lib/testChunker');
const { readCucumberReportFile } = require('../lib/reportFilename');
const { runWithRetries } = require('../lib/retryRunner');

const scheduledJobs = {};
let _io = null;

const setSocketIO = (io) => {
	_io = io;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parses the stored comma-separated runnerIds string into an array. */
function parseRunnerIds(str) {
	if (!str || !str.trim()) return [BUILT_IN_RUNNER_ID];
	return str
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Resolves display names and DB ids for a list of runner IDs. */
async function resolveLaneInfos(runnerIds) {
	return Promise.all(
		runnerIds.map(async (id) => {
			if (id === BUILT_IN_RUNNER_ID) return { id, name: 'Built-in', dbId: null };
			const r = await runnerService.getById(id);
			return { id, name: r?.name ?? id, dbId: r?.id ?? null };
		})
	);
}

// ---------------------------------------------------------------------------
// Run paths
// ---------------------------------------------------------------------------

/**
 * Spawns one `npm run test` attempt for a single-built-in-runner cron task.
 * When `suppressSave` is set, PLUM_MODE=node forces generate-report.js to skip
 * its own DB save — used by the retry path, which persists exactly one merged
 * report itself once every attempt is done.
 */
function runSingleBuiltInAttempt({ taskName, currentTag, workers, browser, suppressSave, onLog }) {
	return new Promise((resolve) => {
		const ssDir = path.join(os.tmpdir(), `plum-cron-ss-${Date.now()}`);
		fs.mkdirSync(ssDir, { recursive: true });

		const env = {
			...process.env,
			TAG: currentTag,
			TRIGGER: taskName,
			BROWSER: browser,
			PLUM_SS_DIR: ssDir
		};
		if (workers > 1) env.PARALLEL = String(workers);
		if (suppressSave) env.PLUM_MODE = PLUM_MODE_NODE;

		const task = spawn('npm', ['run', 'test'], { env, shell: true });

		const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
			if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_SCREENSHOT, { runId: taskName, stepName, data });
		});

		task.stdout.on('data', (d) => {
			process.stdout.write(d);
			onLog(d.toString());
		});
		task.stderr.on('data', (d) => {
			process.stderr.write(d);
			onLog(`[ERROR] ${d.toString()}`);
		});
		task.on('close', (code) => {
			clearInterval(ssPoller);
			fs.rm(ssDir, { recursive: true, force: true }, () => {});
			resolve({ code, raw: suppressSave ? readCucumberReportFile() : null });
		});
	});
}

/**
 * Single built-in runner — spawns tests locally.
 * TRIGGER is set to taskName so generate-report.js can persist it correctly.
 */
async function runSingleBuiltIn({ taskName, tags, workers, browser, notifyDiscord, notifySlack }) {
	const startedAt = Date.now();
	const { maxRetries } = await settingsService.getProject();

	const onLog = (text) => {
		if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_LOG, { runId: taskName, log: text });
	};

	if (maxRetries === 0) {
		const { code } = await runSingleBuiltInAttempt({
			taskName,
			currentTag: tags,
			workers,
			browser,
			suppressSave: false,
			onLog
		});
		console.log(`Task "${taskName}" finished with code ${code}`);

		prisma.report
			.findFirst({
				where: { triggerType: taskName },
				orderBy: { createdAt: 'desc' },
				select: { id: true, status: true, content: true }
			})
			.then((report) => {
				activeRunsService.unregisterRun(taskName);
				if (_io)
					_io.emit(SOCKET_EVENTS.BG_RUN_DONE, {
						runId: taskName,
						code,
						reportId: report?.id ?? null
					});

				if (report) {
					prisma.report
						.update({ where: { id: report.id }, data: { duration: Date.now() - startedAt } })
						.catch(() => {});
				}

				if (report && (notifyDiscord || notifySlack)) {
					return notificationService.send({
						jobName: taskName,
						status: report.status,
						content: report.content,
						browser,
						tags,
						reportId: report.id,
						notifyDiscord,
						notifySlack
					});
				}
			})
			.catch((e) => {
				console.error(`[cron] Notification failed: ${e.message}`);
				activeRunsService.unregisterRun(taskName);
				if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_DONE, { runId: taskName, code, reportId: null });
			});
		return;
	}

	const { code, rawJson, attempts } = await runWithRetries({
		maxRetries,
		spawnAttempt: async (tagOverride) => {
			const { code, raw } = await runSingleBuiltInAttempt({
				taskName,
				currentTag: tagOverride ?? tags,
				workers,
				browser,
				suppressSave: true,
				onLog
			});
			return { code, rawJson: raw ? JSON.parse(raw) : [] };
		},
		onLog
	});

	console.log(`Task "${taskName}" finished with code ${code}`);

	let report = null;
	try {
		report = await reportService.saveReport({
			rawCucumberJson: rawJson,
			tags,
			triggerType: taskName,
			browser,
			duration: Date.now() - startedAt,
			attempts
		});
	} catch (e) {
		console.error(`[cron] Failed to save report: ${e.message}`);
	}

	activeRunsService.unregisterRun(taskName);
	if (_io)
		_io.emit(SOCKET_EVENTS.BG_RUN_DONE, { runId: taskName, code, reportId: report?.id ?? null });

	if (report && (notifyDiscord || notifySlack)) {
		notificationService
			.send({
				jobName: taskName,
				status: report.status,
				content: report.content,
				browser,
				tags,
				reportId: report.id,
				notifyDiscord,
				notifySlack
			})
			.catch((e) => console.error(`[cron] Notification failed: ${e.message}`));
	}
}

/**
 * Multi-runner distributed path — splits tests across nodes and combines reports.
 * triggerType = taskName so the combined report is correctly attributed.
 */
async function runDistributed({
	taskName,
	tags,
	workers,
	browser,
	runnerIds,
	notifyDiscord,
	notifySlack
}) {
	const dispatchStartedAt = Date.now();
	const { maxRetries } = await settingsService.getProject();
	const allIds = getTestIdsForTag(tags);
	const chunks = chunkTests(allIds, runnerIds.length);

	// Surplus runners beyond the number of non-empty chunks would fall back to
	// running the full tag expression, producing duplicate scenarios in the report.
	const activeRunnerIds = runnerIds.slice(0, chunks.length);

	if (activeRunnerIds.length === 0) {
		console.log(`Task "${taskName}" — no tests found, skipping.`);
		activeRunsService.unregisterRun(taskName);
		if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_DONE, { runId: taskName, code: 0, reportId: null });
		return;
	}

	const laneInfos = await resolveLaneInfos(activeRunnerIds);

	if (_io) {
		_io.emit(SOCKET_EVENTS.BG_RUN_LANES_INIT, {
			runId: taskName,
			lanes: laneInfos.map((l, i) => ({ id: l.id, name: l.name, testCount: chunks[i].length }))
		});
	}

	const collectedReports = new Array(activeRunnerIds.length).fill(null);
	const laneAttempts = new Array(activeRunnerIds.length).fill(null);
	let doneCount = 0;
	let overallCode = 0;

	function onLaneDone(idx, laneId, code, reportContent, attempts = null) {
		if (code !== 0) overallCode = code;
		collectedReports[idx] = reportContent;
		laneAttempts[idx] = attempts;
		doneCount++;
		if (_io) {
			_io.emit(SOCKET_EVENTS.BG_RUN_LANE_STATUS, {
				runId: taskName,
				laneId,
				status: code === 0 ? JOB_STATUS.DONE : JOB_STATUS.ERROR
			});
		}

		if (doneCount === activeRunnerIds.length) {
			console.log(`Task "${taskName}" — all runners done (exit ${overallCode})`);

			reportService
				.saveCombinedReport({
					reports: collectedReports,
					runners: laneInfos,
					overallCode,
					tag: tags,
					triggerType: taskName,
					browser,
					duration: Date.now() - dispatchStartedAt,
					attemptsByLane: laneAttempts
				})
				.then((saved) => {
					activeRunsService.unregisterRun(taskName);
					if (_io) {
						_io.emit(SOCKET_EVENTS.BG_RUN_DONE, {
							runId: taskName,
							code: overallCode,
							reportId: saved?.id ?? null
						});
					}
					if (saved && (notifyDiscord || notifySlack)) {
						return notificationService.send({
							jobName: taskName,
							status: saved.status,
							content: saved.content,
							browser,
							tags,
							reportId: saved.id,
							notifyDiscord,
							notifySlack
						});
					}
				})
				.catch((e) => {
					console.error(`[cron] Failed to save combined report: ${e.message}`);
					activeRunsService.unregisterRun(taskName);
					if (_io)
						_io.emit(SOCKET_EVENTS.BG_RUN_DONE, {
							runId: taskName,
							code: overallCode,
							reportId: null
						});
				});
		}
	}

	for (let i = 0; i < activeRunnerIds.length; i++) {
		const lane = laneInfos[i];
		const laneId = lane.id;
		const chunkTag = buildTagExpression(chunks[i]);

		if (lane.id === BUILT_IN_RUNNER_ID) {
			const idx = i;
			const onLog = (text) => {
				if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_LANE_LOG, { runId: taskName, laneId, log: text });
			};

			const spawnBuiltInLaneAttempt = (currentTag) =>
				new Promise((resolve) => {
					const ssDir = path.join(os.tmpdir(), `plum-cron-ss-${Date.now()}-${idx}`);
					fs.mkdirSync(ssDir, { recursive: true });

					const env = {
						...process.env,
						TAG: currentTag,
						TRIGGER: TRIGGER_REMOTE, // node-mode: file naming only, not persisted to DB
						BROWSER: browser,
						PLUM_MODE: PLUM_MODE_NODE,
						PLUM_SS_DIR: ssDir
					};
					if (workers > 1) env.PARALLEL = String(workers);

					const task = spawn('npm', ['run', 'test'], { env, shell: true });

					const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
						if (_io)
							_io.emit(SOCKET_EVENTS.BG_RUN_LANE_SCREENSHOT, {
								runId: taskName,
								laneId,
								stepName,
								data
							});
					});

					task.stdout.on('data', (d) => {
						process.stdout.write(d);
						onLog(d.toString());
					});
					task.stderr.on('data', (d) => {
						process.stderr.write(d);
						onLog(`[ERROR] ${d.toString()}`);
					});
					task.on('close', (code) => {
						clearInterval(ssPoller);
						fs.rm(ssDir, { recursive: true, force: true }, () => {});
						const raw = readCucumberReportFile() ?? '[]';
						resolve({ code, rawJson: JSON.parse(raw) });
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
			const onLog = (log) => {
				process.stdout.write(log);
				if (_io) _io.emit(SOCKET_EVENTS.BG_RUN_LANE_LOG, { runId: taskName, laneId, log });
			};

			const spawnRemoteLaneAttempt = (currentTag) =>
				new Promise((resolve) => {
					runnerService.dispatchAndPoll(
						lane.id,
						{ tags: currentTag, browser, workers },
						onLog,
						(code, content) => resolve({ code, rawJson: content ? JSON.parse(content) : [] }),
						({ stepName, data }) => {
							if (_io)
								_io.emit(SOCKET_EVENTS.BG_RUN_LANE_SCREENSHOT, {
									runId: taskName,
									laneId,
									stepName,
									data
								});
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

// ---------------------------------------------------------------------------
// Public: job execution
// ---------------------------------------------------------------------------

async function runCronJob(job) {
	const {
		taskName,
		tags,
		workers,
		browser,
		runnerIds: runnerIdsStr,
		notifyDiscord,
		notifySlack
	} = job;
	const runnerIds = parseRunnerIds(runnerIdsStr);

	const label = taskName;
	const meta = { tag: tags, browser, workers };
	activeRunsService.registerRun(taskName, { kind: TRIGGER_TYPE.CRON, label, meta });
	if (_io) {
		_io.emit(SOCKET_EVENTS.BG_RUN_START, { runId: taskName, kind: TRIGGER_TYPE.CRON, label, meta });
	}
	console.log(`Running scheduled task: "${taskName}" → runners: ${runnerIds.join(', ')}`);

	const isSingleBuiltIn = runnerIds.length === 1 && runnerIds[0] === BUILT_IN_RUNNER_ID;

	if (isSingleBuiltIn) {
		runSingleBuiltIn({ taskName, tags, workers, browser, notifyDiscord, notifySlack });
	} else {
		await runDistributed({
			taskName,
			tags,
			workers,
			browser,
			runnerIds,
			notifyDiscord,
			notifySlack
		});
	}
}

// ---------------------------------------------------------------------------
// Public: scheduling
// ---------------------------------------------------------------------------

async function scheduleJob(job) {
	const { taskName, cronExpression } = job;
	if (scheduledJobs[taskName]) {
		scheduledJobs[taskName].stop();
		delete scheduledJobs[taskName];
	}
	if (job.enabled === false) return; // disabled jobs are not scheduled
	const project = await prisma.project.findUnique({ where: { id: 1 } });
	scheduledJobs[taskName] = cron.schedule(cronExpression, () => runCronJob(job), {
		timezone: project?.timezone || 'UTC'
	});
}

const init = async () => {
	const jobs = await prisma.cronJob.findMany();
	for (const job of jobs) await scheduleJob(job);
	console.log(`⏰ Scheduled ${jobs.length} cron job(s) from database`);
};

const reload = async () => {
	for (const name of Object.keys(scheduledJobs)) {
		scheduledJobs[name].stop();
		delete scheduledJobs[name];
	}
	await init();
};

// ---------------------------------------------------------------------------
// Public: CRUD
// ---------------------------------------------------------------------------

const getAllCronJobs = () => prisma.cronJob.findMany({ orderBy: { createdAt: 'asc' } });

const addCronJob = async ({
	taskName,
	cronExpression,
	tags,
	workers,
	browser,
	runnerIds,
	notifyDiscord,
	notifySlack
}) => {
	if (!cronExpression || !taskName) {
		return { status: 400, message: 'Missing required parameters' };
	}
	const runnerIdsStr =
		Array.isArray(runnerIds) && runnerIds.length > 0 ? runnerIds.join(',') : BUILT_IN_RUNNER_ID;

	const job = await prisma.cronJob.create({
		data: {
			taskName,
			cronExpression,
			tags: tags ?? '',
			workers: workers ?? 1,
			browser: browser ?? DEFAULT_BROWSER,
			runnerIds: runnerIdsStr,
			notifyDiscord: notifyDiscord ?? false,
			notifySlack: notifySlack ?? false,
			runnerId: null
		}
	});
	await scheduleJob(job);
	return { status: 201, message: `Cron job "${taskName}" added` };
};

const removeCronJob = async (taskName) => {
	const job = await prisma.cronJob.findUnique({ where: { taskName } });
	if (!job) return { status: 404, message: `Cron job "${taskName}" not found` };

	if (scheduledJobs[taskName]) {
		scheduledJobs[taskName].stop();
		delete scheduledJobs[taskName];
	}
	await prisma.cronJob.delete({ where: { taskName } });
	return { status: 200, message: `Cron job "${taskName}" deleted` };
};

const updateCronJob = async (
	oldTaskName,
	{
		taskName: newTaskName,
		cronExpression,
		tags,
		workers,
		browser,
		runnerIds,
		notifyDiscord,
		notifySlack
	}
) => {
	const job = await prisma.cronJob.findUnique({ where: { taskName: oldTaskName } });
	if (!job) return { status: 404, message: `Cron job "${oldTaskName}" not found` };

	if (scheduledJobs[oldTaskName]) {
		scheduledJobs[oldTaskName].stop();
		delete scheduledJobs[oldTaskName];
	}

	const effectiveName = newTaskName?.trim() || oldTaskName;
	const runnerIdsStr =
		Array.isArray(runnerIds) && runnerIds.length > 0 ? runnerIds.join(',') : BUILT_IN_RUNNER_ID;

	const updated = await prisma.cronJob.update({
		where: { taskName: oldTaskName },
		data: {
			taskName: effectiveName,
			cronExpression,
			tags,
			workers: workers ?? 1,
			browser: browser ?? DEFAULT_BROWSER,
			runnerIds: runnerIdsStr,
			notifyDiscord: notifyDiscord ?? false,
			notifySlack: notifySlack ?? false,
			runnerId: null
		}
	});

	await scheduleJob(updated);
	return { status: 200, message: 'Cron job updated' };
};

const runJobNow = async (taskName) => {
	const job = await prisma.cronJob.findUnique({ where: { taskName } });
	if (!job) return { status: 404, message: `Cron job "${taskName}" not found` };
	runCronJob(job);
	return { status: 200 };
};

const toggleCronJob = async (taskName, enabled) => {
	const job = await prisma.cronJob.findUnique({ where: { taskName } });
	if (!job) return { status: 404, message: `Cron job "${taskName}" not found` };

	const updated = await prisma.cronJob.update({
		where: { taskName },
		data: { enabled }
	});

	await scheduleJob(updated); // re-schedules if enabled, stops and removes if disabled
	return { status: 200, enabled: updated.enabled };
};

module.exports = {
	init,
	reload,
	setSocketIO,
	getAllCronJobs,
	addCronJob,
	removeCronJob,
	updateCronJob,
	runJobNow,
	toggleCronJob
};
