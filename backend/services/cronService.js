/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const cron = require('node-cron');
const prisma = require('./prisma');
const runQueueService = require('./runQueueService');
const activityService = require('./activityService');
const { ACTIVITY_ACTION } = require('../constants/activity');
const { BUILT_IN_RUNNER_ID, TRIGGER_TYPE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');

// Keyed by CronJob.id, not taskName — task names are only unique per project, so
// two projects can each have a "nightly" job without clobbering each other.
const scheduledJobs = {};

/** Parses the stored comma-separated runnerIds string into an array. */
function parseRunnerIds(str) {
	if (!str || !str.trim()) return [BUILT_IN_RUNNER_ID];
	return str
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

async function runCronJob(job) {
	const runnerIds = parseRunnerIds(job.runnerIds);
	console.log(`Queuing scheduled task: "${job.taskName}" → runners: ${runnerIds.join(', ')}`);
	await runQueueService.enqueue({
		projectId: job.projectId,
		kind: TRIGGER_TYPE.CRON,
		triggerType: job.taskName,
		label: job.taskName,
		tag: job.tags ?? '',
		workers: job.workers ?? 1,
		browser: job.browser ?? DEFAULT_BROWSER,
		runnerIds,
		notifyDiscord: job.notifyDiscord ?? false,
		notifySlack: job.notifySlack ?? false
	});
}

async function scheduleJob(job) {
	if (scheduledJobs[job.id]) {
		scheduledJobs[job.id].stop();
		delete scheduledJobs[job.id];
	}
	if (job.enabled === false) return;
	const project = await prisma.project.findUnique({ where: { id: job.projectId } });
	scheduledJobs[job.id] = cron.schedule(job.cronExpression, () => runCronJob(job), {
		timezone: project?.timezone || 'UTC'
	});
}

const init = async () => {
	const jobs = await prisma.cronJob.findMany();
	for (const job of jobs) await scheduleJob(job);
	console.log(`⏰ Scheduled ${jobs.length} cron job(s) from database`);
};

const reload = async () => {
	for (const id of Object.keys(scheduledJobs)) {
		scheduledJobs[id].stop();
		delete scheduledJobs[id];
	}
	await init();
};

const getAllCronJobs = (projectId) =>
	prisma.cronJob.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });

async function ownedJob(projectId, taskName) {
	return prisma.cronJob.findFirst({ where: { taskName, projectId } });
}

const addCronJob = async (
	projectId,
	{ taskName, cronExpression, tags, workers, browser, runnerIds, notifyDiscord, notifySlack }
) => {
	if (!cronExpression || !taskName) {
		return { status: 400, message: 'Missing required parameters' };
	}
	const runnerIdsStr =
		Array.isArray(runnerIds) && runnerIds.length > 0 ? runnerIds.join(',') : BUILT_IN_RUNNER_ID;

	const job = await prisma.cronJob.create({
		data: {
			projectId,
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
	await activityService.record(ACTIVITY_ACTION.SCHEDULE_CREATE, {
		projectId,
		target: { type: 'schedule', id: job.id, label: taskName }
	});
	return { status: 201, message: `Cron job "${taskName}" added` };
};

const removeCronJob = async (projectId, taskName) => {
	const job = await ownedJob(projectId, taskName);
	if (!job) return { status: 404, message: `Cron job "${taskName}" not found` };

	if (scheduledJobs[job.id]) {
		scheduledJobs[job.id].stop();
		delete scheduledJobs[job.id];
	}
	await prisma.cronJob.delete({ where: { id: job.id } });
	await activityService.record(ACTIVITY_ACTION.SCHEDULE_DELETE, {
		projectId,
		target: { type: 'schedule', id: job.id, label: taskName }
	});
	return { status: 200, message: `Cron job "${taskName}" deleted` };
};

const updateCronJob = async (
	projectId,
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
	const job = await ownedJob(projectId, oldTaskName);
	if (!job) return { status: 404, message: `Cron job "${oldTaskName}" not found` };

	if (scheduledJobs[job.id]) {
		scheduledJobs[job.id].stop();
		delete scheduledJobs[job.id];
	}

	const effectiveName = newTaskName?.trim() || oldTaskName;
	const runnerIdsStr =
		Array.isArray(runnerIds) && runnerIds.length > 0 ? runnerIds.join(',') : BUILT_IN_RUNNER_ID;

	const updated = await prisma.cronJob.update({
		where: { id: job.id },
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
	await activityService.record(ACTIVITY_ACTION.SCHEDULE_UPDATE, {
		projectId,
		target: { type: 'schedule', id: updated.id, label: effectiveName }
	});
	return { status: 200, message: 'Cron job updated' };
};

const runJobNow = async (projectId, taskName) => {
	const job = await ownedJob(projectId, taskName);
	if (!job) return { status: 404, message: `Cron job "${taskName}" not found` };
	runCronJob(job);
	return { status: 200 };
};

const toggleCronJob = async (projectId, taskName, enabled) => {
	const job = await ownedJob(projectId, taskName);
	if (!job) return { status: 404, message: `Cron job "${taskName}" not found` };

	const updated = await prisma.cronJob.update({ where: { id: job.id }, data: { enabled } });
	await scheduleJob(updated);
	await activityService.record(ACTIVITY_ACTION.SCHEDULE_TOGGLE, {
		projectId,
		target: { type: 'schedule', id: updated.id, label: taskName },
		metadata: { enabled: updated.enabled }
	});
	return { status: 200, enabled: updated.enabled };
};

module.exports = {
	init,
	reload,
	getAllCronJobs,
	addCronJob,
	removeCronJob,
	updateCronJob,
	runJobNow,
	toggleCronJob
};
