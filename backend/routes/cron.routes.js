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

router.get('/', async (req, res) => {
	try {
		const cronJobs = await cronService.getAllCronJobs();
		res.json({ cronJobs });
	} catch (error) {
		console.error('Error fetching cron jobs:', error);
		res.status(500).json({ error: 'Failed to fetch cron jobs' });
	}
});

router.post('/', async (req, res) => {
	try {
		const { cronExpression, taskName, tags } = req.body;
		if (!cronExpression || !taskName || !tags) {
			return res.status(400).json({ error: 'Missing required fields' });
		}
		await cronService.addCronJob(req.body);
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

router.put('/:taskName', async (req, res) => {
	try {
		const { taskName } = req.params;
		const { cronExpression, tags } = req.body;
		if (!cronExpression || !tags) {
			return res.status(400).json({ error: 'Missing required fields' });
		}
		await cronService.updateCronJob(taskName, req.body);
		res.json({ message: `Cron job ${taskName} updated`, taskName, cronExpression, tags });
	} catch (error) {
		console.error('Error updating cron job:', error);
		res.status(500).json({ error: 'Failed to update cron job' });
	}
});

router.patch('/:taskName/toggle', async (req, res) => {
	try {
		const { taskName } = req.params;
		const { enabled } = req.body;
		if (typeof enabled !== 'boolean') {
			return res.status(400).json({ error: 'enabled must be a boolean' });
		}
		const result = await cronService.toggleCronJob(taskName, enabled);
		if (result.status === 404) return res.status(404).json({ error: result.message });
		res.json({ taskName, enabled: result.enabled });
	} catch (error) {
		console.error('Error toggling cron job:', error);
		res.status(500).json({ error: 'Failed to toggle cron job' });
	}
});

router.post('/:taskName/run', async (req, res) => {
	try {
		const { taskName } = req.params;
		const result = await cronService.runJobNow(taskName);
		if (result.status === 404) return res.status(404).json({ error: result.message });
		res.json({ message: `Cron job ${taskName} triggered` });
	} catch (error) {
		console.error('Error running cron job:', error);
		res.status(500).json({ error: 'Failed to run cron job' });
	}
});

router.delete('/:taskName', async (req, res) => {
	try {
		const { taskName } = req.params;
		await cronService.removeCronJob(taskName);
		res.json({ message: `Cron job ${taskName} deleted` });
	} catch (error) {
		console.error('Error deleting cron job:', error);
		res.status(500).json({ error: 'Failed to delete cron job' });
	}
});

module.exports = router;
