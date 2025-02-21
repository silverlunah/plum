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

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');

const CRON_JOBS_FILE = path.join(__dirname, '../config/cron-jobs.json');
let cronJobs = {};

const loadCronJobs = () => {
	if (fs.existsSync(CRON_JOBS_FILE)) {
		cronJobs = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf8'));

		// Schedule all loaded cron jobs and store only necessary data in memory
		Object.keys(cronJobs).forEach((taskName) => {
			const { cronExpression, tags } = cronJobs[taskName];
			const scheduledCronJob = cron.schedule(cronExpression, () => {
				console.log(`Running new task: ${taskName}`);

				const task = spawn('npm', ['run', 'test'], {
					env: { ...process.env, TAG: tags, TRIGGER: taskName }
				});

				task.stdout.on('data', (data) => console.log(data.toString()));
				task.stderr.on('data', (data) => console.error(data.toString()));
				task.on('close', (code) => console.log(`Task ${taskName} finished with code ${code}`));
			});

			// Store the reference to the cron job only in memory
			cronJobs[taskName].cronJob = scheduledCronJob;
		});
	}
};

const saveCronJobs = () => {
	// Save only cron job data (not the reference to the cron job object) to the file
	const cronJobsData = Object.keys(cronJobs).reduce((acc, taskName) => {
		const { cronExpression, tags } = cronJobs[taskName];
		acc[taskName] = { cronExpression, tags }; // Exclude the cronJob reference
		return acc;
	}, {});

	fs.writeFileSync(CRON_JOBS_FILE, JSON.stringify(cronJobsData, null, 2), 'utf8');
};

const getAllCronJobs = () =>
	Object.keys(cronJobs).map((taskName) => ({
		taskName,
		cronExpression: cronJobs[taskName].cronExpression,
		tags: cronJobs[taskName].tags
	}));

const addCronJob = ({ cronExpression, taskName, tags }) => {
	if (!cronExpression || !taskName || !tags) {
		return { status: 400, message: 'Missing required parameters' };
	}

	cronJobs[taskName] = { cronExpression, tags };
	saveCronJobs();
	loadCronJobs(); // Re-load and schedule the new cron job
	return { status: 201, message: `Cron job ${taskName} added` };
};

const removeCronJob = (taskName) => {
	if (!cronJobs[taskName]) {
		return { status: 404, message: `Cron job ${taskName} not found` };
	}

	// Stop the cron job before removing
	cronJobs[taskName].cronJob.stop();

	delete cronJobs[taskName];
	saveCronJobs();
	loadCronJobs(); // Re-load and re-schedule cron jobs without the removed one
	return { status: 200, message: `Cron job ${taskName} deleted` };
};

const updateCronJob = (taskName, { cronExpression, tags }) => {
	if (!cronJobs[taskName]) {
		return { status: 404, message: `Cron job ${taskName} not found` };
	}

	// Stop the old cron job
	cronJobs[taskName].cronJob.stop();

	// Update the cron job with new values
	cronJobs[taskName] = { cronExpression, tags };

	// Reschedule the updated cron job and store the reference
	const scheduledCronJob = cron.schedule(cronExpression, () => {
		console.log(`Running updated task: ${taskName}`);

		const task = spawn('npm', ['run', 'test'], {
			env: { ...process.env, TAG: tags, TRIGGER: taskName }
		});

		task.stdout.on('data', (data) => console.log(data.toString()));
		task.stderr.on('data', (data) => console.error(data.toString()));
		task.on('close', (code) => console.log(`Task ${taskName} finished with code ${code}`));
	});

	// Store the new cron job reference in memory
	cronJobs[taskName].cronJob = scheduledCronJob;

	saveCronJobs(); // Save the updated cron jobs to file (excluding cron job references)
	return { status: 200, message: `Cron job ${taskName} updated` };
};

loadCronJobs(); // Initial load and scheduling of cron jobs

module.exports = { getAllCronJobs, addCronJob, removeCronJob, updateCronJob };
