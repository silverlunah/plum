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

const cron = require('node-cron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const prisma = require('./prisma');
const runnerService = require('./runnerService');
const reportService = require('./reportService');
const notificationService = require('./notificationService');
const { startSsPoller } = require('../lib/screenshotPoller');
const { BUILT_IN_RUNNER_ID, TRIGGER_REMOTE } = require('../constants/triggers');
const { getTestIdsForTag, chunkTests, buildTagExpression } = require('../lib/testChunker');
const { readCucumberReportFile } = require('../lib/reportFilename');

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
 * Single built-in runner — spawns tests locally.
 * TRIGGER is set to taskName so generate-report.js can persist it correctly.
 */
function runSingleBuiltIn({ taskName, tags, workers, browser, notifyDiscord, notifySlack }) {
	const ssDir = path.join(os.tmpdir(), `plum-cron-ss-${Date.now()}`);
	fs.mkdirSync(ssDir, { recursive: true });

	const env = {
		...process.env,
		TAG: tags,
		TRIGGER: taskName,
		BROWSER: browser,
		PLUM_SS_DIR: ssDir
	};
	if (workers > 1) env.PARALLEL = String(workers);

	const task = spawn('npm', ['run', 'test'], { env, shell: true });

	const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
		if (_io) _io.emit('bg-run-screenshot', { runId: taskName, stepName, data });
	});

	task.stdout.on('data', (d) => {
		process.stdout.write(d);
		if (_io) _io.emit('bg-run-log', { runId: taskName, log: d.toString() });
	});
	task.stderr.on('data', (d) => {
		process.stderr.write(d);
		if (_io) _io.emit('bg-run-log', { runId: taskName, log: `[ERROR] ${d.toString()}` });
	});
	task.on('close', (code) => {
		clearInterval(ssPoller);
		fs.rm(ssDir, { recursive: true, force: true }, () => {});
		console.log(`Task "${taskName}" finished with code ${code}`);

		prisma.report
			.findFirst({
				where: { triggerType: taskName },
				orderBy: { createdAt: 'desc' },
				select: { id: true, status: true, content: true }
			})
			.then((report) => {
				if (_io) _io.emit('bg-run-done', { runId: taskName, code, reportId: report?.id ?? null });

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
				if (_io) _io.emit('bg-run-done', { runId: taskName, code, reportId: null });
			});
	});
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
	const allIds = getTestIdsForTag(tags);
	const chunks = chunkTests(allIds, runnerIds.length);

	// Surplus runners beyond the number of non-empty chunks would fall back to
	// running the full tag expression, producing duplicate scenarios in the report.
	const activeRunnerIds = runnerIds.slice(0, chunks.length);

	if (activeRunnerIds.length === 0) {
		console.log(`Task "${taskName}" — no tests found, skipping.`);
		if (_io) _io.emit('bg-run-done', { runId: taskName, code: 0, reportId: null });
		return;
	}

	const laneInfos = await resolveLaneInfos(activeRunnerIds);

	if (_io) {
		_io.emit('bg-run-lanes-init', {
			runId: taskName,
			lanes: laneInfos.map((l, i) => ({ id: l.id, name: l.name, testCount: chunks[i].length }))
		});
	}

	const collectedReports = new Array(activeRunnerIds.length).fill(null);
	let doneCount = 0;
	let overallCode = 0;

	function onLaneDone(idx, laneId, code, reportContent) {
		if (code !== 0) overallCode = code;
		collectedReports[idx] = reportContent;
		doneCount++;
		if (_io) {
			_io.emit('bg-run-lane-status', {
				runId: taskName,
				laneId,
				status: code === 0 ? 'done' : 'error'
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
					browser
				})
				.then((saved) => {
					if (_io) {
						_io.emit('bg-run-done', {
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
					if (_io) _io.emit('bg-run-done', { runId: taskName, code: overallCode, reportId: null });
				});
		}
	}

	for (let i = 0; i < activeRunnerIds.length; i++) {
		const lane = laneInfos[i];
		const laneId = lane.id;
		const chunkTag = buildTagExpression(chunks[i]);

		if (lane.id === BUILT_IN_RUNNER_ID) {
			const ssDir = path.join(os.tmpdir(), `plum-cron-ss-${Date.now()}-${i}`);
			fs.mkdirSync(ssDir, { recursive: true });

			const env = {
				...process.env,
				TAG: chunkTag,
				TRIGGER: TRIGGER_REMOTE, // node-mode: file naming only, not persisted to DB
				BROWSER: browser,
				PLUM_MODE: 'node',
				PLUM_SS_DIR: ssDir
			};
			if (workers > 1) env.PARALLEL = String(workers);

			const task = spawn('npm', ['run', 'test'], { env, shell: true });

			const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
				if (_io) _io.emit('bg-run-lane-screenshot', { runId: taskName, laneId, stepName, data });
			});

			task.stdout.on('data', (d) => {
				process.stdout.write(d);
				if (_io) _io.emit('bg-run-lane-log', { runId: taskName, laneId, log: d.toString() });
			});
			task.stderr.on('data', (d) => {
				const text = `[ERROR] ${d.toString()}`;
				process.stderr.write(d);
				if (_io) _io.emit('bg-run-lane-log', { runId: taskName, laneId, log: text });
			});
			const idx = i;
			task.on('close', (code) => {
				clearInterval(ssPoller);
				fs.rm(ssDir, { recursive: true, force: true }, () => {});
				onLaneDone(idx, laneId, code, readCucumberReportFile());
			});
		} else {
			const idx = i;
			runnerService.dispatchAndPoll(
				lane.id,
				{ tags: chunkTag, browser, workers },
				(log) => {
					process.stdout.write(log);
					if (_io) _io.emit('bg-run-lane-log', { runId: taskName, laneId, log });
				},
				(code, content) => onLaneDone(idx, laneId, code, content),
				({ stepName, data }) => {
					if (_io) _io.emit('bg-run-lane-screenshot', { runId: taskName, laneId, stepName, data });
				}
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

	if (_io) {
		_io.emit('bg-run-start', {
			runId: taskName,
			kind: 'cron',
			label: taskName,
			meta: { tag: tags, browser, workers }
		});
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
			browser: browser ?? 'chromium',
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
			browser: browser ?? 'chromium',
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
