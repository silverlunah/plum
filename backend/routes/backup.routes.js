/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const backupService = require('../services/backupService');
const settingsService = require('../services/settingsService');
const cronService = require('../services/cronService');
const backupCronService = require('../services/backupCronService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

router.get('/export', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const data = await backupService.exportAll();
		const fileName = `plum-backup-${new Date().toISOString().slice(0, 10)}.json`;
		res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
		res.setHeader('Content-Type', 'application/json');
		res.json(data);
	} catch (error) {
		console.error('Export failed:', error);
		res.status(500).json({ error: 'Export failed' });
	}
});

router.post('/import', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { cronJobs, project, users, runners, testSuites, testRuns } = req.body;
		const hasData = [cronJobs, project, users, runners, testSuites, testRuns].some(
			(v) => v !== undefined && v !== null
		);
		if (!hasData) return res.status(400).json({ error: 'Invalid backup format' });
		await backupService.importAll(
			{ cronJobs, project, users, runners, testSuites, testRuns },
			cronService
		);
		res.json({ message: 'Import successful' });
	} catch (error) {
		console.error('Import failed:', error);
		res.status(500).json({ error: 'Import failed' });
	}
});

router.get('/config', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const config = await settingsService.getBackupConfig();
		res.json(config);
	} catch (error) {
		console.error('Failed to get backup config:', error);
		res.status(500).json({ error: 'Failed to get backup configuration' });
	}
});

router.post('/config', jwtAuth, requireAdmin, async (req, res) => {
	try {
		await settingsService.updateBackupConfig(req.body);
		await backupCronService.reload();
		const config = await settingsService.getBackupConfig();
		res.json(config);
	} catch (error) {
		console.error('Failed to save backup config:', error);
		res.status(500).json({ error: 'Failed to save backup configuration' });
	}
});

router.post('/test-s3', jwtAuth, requireAdmin, async (req, res) => {
	try {
		// If no secret key provided in the request, fall back to the stored one
		let config = { ...req.body };
		if (!config.backupS3SecretKey) {
			const stored = await settingsService.getProjectRaw();
			config.backupS3SecretKey = stored?.backupS3SecretKey ?? '';
		}

		const required = ['backupS3Bucket', 'backupS3AccessKey', 'backupS3SecretKey'];
		const missing = required.filter((k) => !config[k]);
		if (missing.length > 0) {
			return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
		}

		await backupService.testS3Connection(config);
		res.json({ ok: true });
	} catch (error) {
		res.status(400).json({ error: error.message || 'Connection failed' });
	}
});

router.post('/run-now', jwtAuth, requireAdmin, async (req, res) => {
	try {
		await backupCronService.runBackup();
		const config = await settingsService.getBackupConfig();
		if (config.backupLastStatus?.startsWith('error:')) {
			return res.status(500).json({ error: config.backupLastStatus.replace('error:', '') });
		}
		res.json({ ok: true, lastRunAt: config.backupLastRunAt, lastStatus: config.backupLastStatus });
	} catch (error) {
		console.error('Backup run-now failed:', error);
		res.status(500).json({ error: error.message || 'Backup failed' });
	}
});

module.exports = router;
