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

const express = require('express');
const router = express.Router();
const cronService = require('../services/cronService');

/* -----------------------------------------------------
 *                   Get Cron Jobs
 *  Description:
 * 		- Get all cron jobs from config/cron-jobs.json
 * ------------------------------------------------------ */
router.get('/', (req, res) => {
	try {
		const cronJobs = cronService.getAllCronJobs();
		res.json({ cronJobs });
	} catch (error) {
		console.error('Error fetching cron jobs:', error);
		res.status(500).json({ error: 'Failed to fetch cron jobs' });
	}
});

/* -----------------------------------------------------
 *                    Create Cron Job
 *  Description:
 * 		Add a new cron job to config/cron-jobs.json
 *  Params:
 * 		- cronExpression:
 * 			e.g. "* * * * *"
 * 			https://www.baeldung.com/cron-expressions
 * 		- taskName:
 * 			the unique identifier
 * 		- tags:
 * 			cucumber tag you want to run when cron job
 * 			is triggered.
 * ------------------------------------------------------ */
router.post('/', (req, res) => {
	try {
		const { cronExpression, taskName, tags } = req.body;
		if (!cronExpression || !taskName || !tags) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		cronService.addCronJob(req.body);
		res.json({
			message: `Cron job ${taskName} added with tags: ${tags}`,
			taskName,
			cronExpression
		});
	} catch (error) {
		console.error('Error adding cron job:', error);
		res.status(500).json({ error: 'Failed to add cron job' });
	}
});

/* -----------------------------------------------------
 *                    Edit Cron Job
 *  Description:
 * 		Edit an existing cron job from
 * 		config/cron-jobs.json
 *  Params:
 * 		- taskName:
 * 			the unique identifier
 * 		- cronExpression:
 * 			e.g. "* * * * *"
 * 			https://www.baeldung.com/cron-expressions
 * 		- tags:
 * 			cucumber tag you want to run when cron job
 * 			is triggered.
 * ------------------------------------------------------ */
router.put('/:taskName', (req, res) => {
	try {
		const { taskName } = req.params;
		const { cronExpression, tags } = req.body;

		if (!cronExpression || !tags) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		const updatedCronJob = cronService.updateCronJob(taskName, req.body); // Assuming this is a function to update the cron job
		res.json({
			message: `Cron job ${taskName} updated`,
			taskName,
			cronExpression,
			tags: updatedCronJob.tags
		});
	} catch (error) {
		console.error('Error updating cron job:', error);
		res.status(500).json({ error: 'Failed to update cron job' });
	}
});

/* -----------------------------------------------------
 *                    Delete Cron Job
 *  Description:
 * 		Delete cron job from config/cron-jobs.json
 * 		by taskName
 *  Params:
 * 		- taskName:
 * 			the unique identifier
 * ------------------------------------------------------ */
router.delete('/:taskName', (req, res) => {
	try {
		const { taskName } = req.params;
		cronService.removeCronJob(taskName);
		res.json({ message: `Cron job ${taskName} deleted` });
	} catch (error) {
		console.error('Error deleting cron job:', error);
		res.status(500).json({ error: 'Failed to delete cron job' });
	}
});

module.exports = router;
