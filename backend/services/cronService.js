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
const prisma = require('./prisma');
const runnerService = require('./runnerService');
const reportService = require('./reportService');
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
function runSingleBuiltIn({ taskName, tags, workers, browser }) {
	const env = {
		...process.env,
		TAG: tags,
		TRIGGER: taskName,
		BROWSER: browser
	};
	if (workers > 1) env.PARALLEL = String(workers);

	const task = spawn('npm', ['run', 'test'], { env, shell: true });
	task.stdout.on('data', (d) => process.stdout.write(d));
	task.stderr.on('data', (d) => process.stderr.write(d));
	task.on('close', (code) => {
		console.log(`Task "${taskName}" finished with code ${code}`);
		if (_io) _io.emit('cron-done', { taskName, code });
	});
}

/**
 * Multi-runner distributed path — splits tests across nodes and combines reports.
 * triggerType = taskName so the combined report is correctly attributed.
 */
async function runDistributed({ taskName, tags, workers, browser, runnerIds }) {
	const allIds = getTestIdsForTag(tags);
	const chunks = chunkTests(allIds, runnerIds.length);
	const laneInfos = await resolveLaneInfos(runnerIds);

	const collectedReports = new Array(runnerIds.length).fill(null);
	let doneCount = 0;
	let overallCode = 0;

	function onLaneDone(idx, code, reportContent) {
		if (code !== 0) overallCode = code;
		collectedReports[idx] = reportContent;
		doneCount++;

		if (doneCount === runnerIds.length) {
			console.log(`Task "${taskName}" — all runners done (exit ${overallCode})`);
			if (_io) _io.emit('cron-done', { taskName, code: overallCode });

			reportService
				.saveCombinedReport({
					reports: collectedReports,
					runners: laneInfos,
					overallCode,
					tag: tags,
					triggerType: taskName,
					browser
				})
				.catch((e) => console.error(`[cron] Failed to save combined report: ${e.message}`));
		}
	}

	for (let i = 0; i < runnerIds.length; i++) {
		const lane = laneInfos[i];
		const chunkTag = chunks[i]?.length > 0 ? buildTagExpression(chunks[i]) : tags;

		if (lane.id === BUILT_IN_RUNNER_ID) {
			const env = {
				...process.env,
				TAG: chunkTag,
				TRIGGER: TRIGGER_REMOTE, // node-mode: file naming only, not persisted to DB
				BROWSER: browser,
				PLUM_MODE: 'node'
			};
			if (workers > 1) env.PARALLEL = String(workers);

			const task = spawn('npm', ['run', 'test'], { env, shell: true });
			task.stdout.on('data', (d) => process.stdout.write(d));
			task.stderr.on('data', (d) => process.stderr.write(d));
			const idx = i;
			task.on('close', (code) => onLaneDone(idx, code, readCucumberReportFile()));
		} else {
			const idx = i;
			runnerService.dispatchAndPoll(
				lane.id,
				{ tags: chunkTag, browser, workers },
				(log) => process.stdout.write(log),
				(code, content) => onLaneDone(idx, code, content)
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Public: job execution
// ---------------------------------------------------------------------------

async function runCronJob(job) {
	const { taskName, tags, workers, browser, runnerIds: runnerIdsStr } = job;
	const runnerIds = parseRunnerIds(runnerIdsStr);

	if (_io) _io.emit('cron-start', { taskName });
	console.log(`Running scheduled task: "${taskName}" → runners: ${runnerIds.join(', ')}`);

	const isSingleBuiltIn = runnerIds.length === 1 && runnerIds[0] === BUILT_IN_RUNNER_ID;

	if (isSingleBuiltIn) {
		runSingleBuiltIn({ taskName, tags, workers, browser });
	} else {
		await runDistributed({ taskName, tags, workers, browser, runnerIds });
	}
}

// ---------------------------------------------------------------------------
// Public: scheduling
// ---------------------------------------------------------------------------

function scheduleJob(job) {
	const { taskName, cronExpression } = job;
	if (scheduledJobs[taskName]) {
		scheduledJobs[taskName].stop();
		delete scheduledJobs[taskName];
	}
	if (job.enabled === false) return; // disabled jobs are not scheduled
	scheduledJobs[taskName] = cron.schedule(cronExpression, () => runCronJob(job));
}

const init = async () => {
	const jobs = await prisma.cronJob.findMany();
	for (const job of jobs) scheduleJob(job);
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

const addCronJob = async ({ taskName, cronExpression, tags, workers, browser, runnerIds }) => {
	if (!cronExpression || !taskName || !tags) {
		return { status: 400, message: 'Missing required parameters' };
	}
	const runnerIdsStr =
		Array.isArray(runnerIds) && runnerIds.length > 0 ? runnerIds.join(',') : BUILT_IN_RUNNER_ID;

	const job = await prisma.cronJob.create({
		data: {
			taskName,
			cronExpression,
			tags,
			workers: workers ?? 1,
			browser: browser ?? 'chromium',
			runnerIds: runnerIdsStr,
			runnerId: null
		}
	});
	scheduleJob(job);
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
	{ taskName: newTaskName, cronExpression, tags, workers, browser, runnerIds }
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
			runnerId: null
		}
	});

	scheduleJob(updated);
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

	scheduleJob(updated); // re-schedules if enabled, stops and removes if disabled
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
