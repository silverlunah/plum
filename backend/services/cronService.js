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

const scheduledJobs = {};
let _io = null;

const setSocketIO = (io) => {
	_io = io;
};

function scheduleJob(taskName, cronExpression, tags, workers) {
	if (scheduledJobs[taskName]) {
		scheduledJobs[taskName].stop();
		delete scheduledJobs[taskName];
	}

	scheduledJobs[taskName] = cron.schedule(cronExpression, () => {
		console.log(`Running scheduled task: ${taskName}`);
		if (_io) _io.emit('cron-start', { taskName });

		const env = { ...process.env, TAG: tags, TRIGGER: taskName };
		if (workers && workers > 1) env.PARALLEL = String(workers);

		const task = spawn('npm', ['run', 'test'], { env, shell: true });
		task.stdout.on('data', (data) => console.log(data.toString()));
		task.stderr.on('data', (data) => console.error(data.toString()));
		task.on('close', (code) => {
			console.log(`Task ${taskName} finished with code ${code}`);
			if (_io) _io.emit('cron-done', { taskName, code });
		});
	});
}

const init = async () => {
	const jobs = await prisma.cronJob.findMany();
	for (const job of jobs) {
		scheduleJob(job.taskName, job.cronExpression, job.tags, job.workers);
	}
	console.log(`⏰ Scheduled ${jobs.length} cron job(s) from database`);
};

const reload = async () => {
	for (const name of Object.keys(scheduledJobs)) {
		scheduledJobs[name].stop();
		delete scheduledJobs[name];
	}
	await init();
};

const getAllCronJobs = async () => {
	return prisma.cronJob.findMany({ orderBy: { createdAt: 'asc' } });
};

const addCronJob = async ({ taskName, cronExpression, tags, workers }) => {
	if (!cronExpression || !taskName || !tags) {
		return { status: 400, message: 'Missing required parameters' };
	}
	const job = await prisma.cronJob.create({
		data: { taskName, cronExpression, tags, workers: workers ?? 1 }
	});
	scheduleJob(job.taskName, job.cronExpression, job.tags, job.workers);
	return { status: 201, message: `Cron job ${taskName} added` };
};

const removeCronJob = async (taskName) => {
	const job = await prisma.cronJob.findUnique({ where: { taskName } });
	if (!job) return { status: 404, message: `Cron job ${taskName} not found` };

	if (scheduledJobs[taskName]) {
		scheduledJobs[taskName].stop();
		delete scheduledJobs[taskName];
	}

	await prisma.cronJob.delete({ where: { taskName } });
	return { status: 200, message: `Cron job ${taskName} deleted` };
};

const updateCronJob = async (taskName, { cronExpression, tags, workers }) => {
	const job = await prisma.cronJob.findUnique({ where: { taskName } });
	if (!job) return { status: 404, message: `Cron job ${taskName} not found` };

	const updated = await prisma.cronJob.update({
		where: { taskName },
		data: { cronExpression, tags, workers: workers ?? 1 }
	});

	scheduleJob(updated.taskName, updated.cronExpression, updated.tags, updated.workers);
	return { status: 200, message: `Cron job ${taskName} updated` };
};

module.exports = {
	init,
	reload,
	getAllCronJobs,
	addCronJob,
	removeCronJob,
	updateCronJob,
	setSocketIO
};
