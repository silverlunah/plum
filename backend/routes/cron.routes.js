/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const cronService = require('../services/cronService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');

router.use(jwtAuth, requireProjectAccess);

router.get('/', async (req, res) => {
	try {
		res.json({ cronJobs: await cronService.getAllCronJobs(req.projectId) });
	} catch (error) {
		console.error('Error fetching cron jobs:', error);
		res.status(500).json({ error: 'Failed to fetch cron jobs' });
	}
});

router.post('/', async (req, res) => {
	try {
		const { cronExpression, taskName, tags } = req.body;
		if (!cronExpression || !taskName) {
			return res.status(400).json({ error: 'Missing required fields' });
		}
		await cronService.addCronJob(req.projectId, req.body);
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
		if (!cronExpression) return res.status(400).json({ error: 'Missing required fields' });
		const result = await cronService.updateCronJob(req.projectId, taskName, req.body);
		if (result.status === 404) return res.status(404).json({ error: result.message });
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
		const result = await cronService.toggleCronJob(req.projectId, taskName, enabled);
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
		const result = await cronService.runJobNow(req.projectId, taskName);
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
		const result = await cronService.removeCronJob(req.projectId, taskName);
		if (result.status === 404) return res.status(404).json({ error: result.message });
		res.json({ message: `Cron job ${taskName} deleted` });
	} catch (error) {
		console.error('Error deleting cron job:', error);
		res.status(500).json({ error: 'Failed to delete cron job' });
	}
});

module.exports = router;
