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
const { requireOwner } = require('../middleware/requireOwner');

// DB backup is instance-level (one database); its config lives on the org.
router.use(jwtAuth, requireOwner);

router.get('/export', async (req, res) => {
	try {
		const { backupIncludeReports } = await settingsService.getBackupConfig();
		const data = await backupService.exportAll(backupIncludeReports);
		const fileName = `plum-backup-${new Date().toISOString().slice(0, 10)}.json`;
		res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
		res.setHeader('Content-Type', 'application/json');
		res.json(data);
	} catch (error) {
		console.error('Export failed:', error);
		res.status(500).json({ error: 'Export failed' });
	}
});

router.post('/import', async (req, res) => {
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

router.get('/config', async (req, res) => {
	try {
		const config = await settingsService.getBackupConfig();
		res.json(config);
	} catch (error) {
		console.error('Failed to get backup config:', error);
		res.status(500).json({ error: 'Failed to get backup configuration' });
	}
});

router.post('/config', async (req, res) => {
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

router.get('/report-retention', async (req, res) => {
	try {
		res.json(await settingsService.getReportRetention());
	} catch (error) {
		console.error('Failed to get report retention:', error);
		res.status(500).json({ error: 'Failed to get report retention' });
	}
});

router.put('/report-retention', async (req, res) => {
	try {
		res.json(await settingsService.updateReportRetention(req.body?.days));
	} catch (error) {
		console.error('Failed to save report retention:', error);
		res.status(500).json({ error: 'Failed to save report retention' });
	}
});

router.post('/test-s3', async (req, res) => {
	try {
		// If no secret key provided in the request, fall back to the stored one
		let config = { ...req.body };
		if (!config.backupS3SecretKey) {
			const stored = await settingsService.getOrgRaw();
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

router.get('/s3-backups', async (req, res) => {
	try {
		const config = await settingsService.getOrgRaw();
		const required = ['backupS3Bucket', 'backupS3AccessKey', 'backupS3SecretKey'];
		const missing = required.filter((k) => !config[k]);
		if (missing.length > 0) {
			return res
				.status(400)
				.json({ error: `S3 is not configured (missing: ${missing.join(', ')})` });
		}
		const backups = await backupService.listS3Backups(config);
		res.json({ backups });
	} catch (error) {
		console.error('Failed to list S3 backups:', error);
		res.status(500).json({ error: error.message || 'Failed to list S3 backups' });
	}
});

router.post('/s3-restore', async (req, res) => {
	try {
		const { key } = req.body;
		if (!key) return res.status(400).json({ error: 'Missing backup key' });

		const config = await settingsService.getOrgRaw();
		const required = ['backupS3Bucket', 'backupS3AccessKey', 'backupS3SecretKey'];
		const missing = required.filter((k) => !config[k]);
		if (missing.length > 0) {
			return res
				.status(400)
				.json({ error: `S3 is not configured (missing: ${missing.join(', ')})` });
		}

		const data = await backupService.downloadFromS3(key, config);
		const { cronJobs, project, users, runners, testSuites, testRuns } = data;
		await backupService.importAll(
			{ cronJobs, project, users, runners, testSuites, testRuns },
			cronService
		);
		res.json({ message: 'Restore successful' });
	} catch (error) {
		console.error('S3 restore failed:', error);
		res.status(500).json({ error: error.message || 'Restore failed' });
	}
});

router.post('/run-now', async (req, res) => {
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
