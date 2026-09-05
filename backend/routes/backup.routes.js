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
const userService = require('../services/userService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireOwner } = require('../middleware/requireOwner');

// A server that lost its data has no owner to authenticate as, so restoring
// its own backup can't require one. Open only in the same no-users-yet window
// /auth/setup uses; locks back to owner-only the moment any user exists.
function restoreGate(req, res, next) {
	userService
		.needsSetup()
		.then((needsSetup) => {
			if (needsSetup) return next();
			jwtAuth(req, res, () => requireOwner(req, res, next));
		})
		.catch(next);
}

router.get('/export', jwtAuth, requireOwner, async (req, res) => {
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

router.post('/import', restoreGate, async (req, res) => {
	try {
		// Handed to the service whole. Picking fields out here is what silently
		// dropped `reports` from every restore: the export wrote them, the
		// importer knew how to read them, and this list didn't mention them.
		const body = req.body ?? {};
		const hasData = [
			'projects',
			'cronJobs',
			'project',
			'users',
			'runners',
			'testSuites',
			'testRuns'
		].some((k) => body[k] !== undefined && body[k] !== null);
		if (!hasData) return res.status(400).json({ error: 'Invalid backup format' });
		await backupService.importAll(body, cronService);
		res.json({ message: 'Import successful' });
	} catch (error) {
		console.error('Import failed:', error);
		res.status(500).json({ error: 'Import failed' });
	}
});

router.get('/config', jwtAuth, requireOwner, async (req, res) => {
	try {
		const config = await settingsService.getBackupConfig();
		res.json(config);
	} catch (error) {
		console.error('Failed to get backup config:', error);
		res.status(500).json({ error: 'Failed to get backup configuration' });
	}
});

router.post('/config', jwtAuth, requireOwner, async (req, res) => {
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

router.get('/report-retention', jwtAuth, requireOwner, async (req, res) => {
	try {
		res.json(await settingsService.getReportRetention());
	} catch (error) {
		console.error('Failed to get report retention:', error);
		res.status(500).json({ error: 'Failed to get report retention' });
	}
});

router.put('/report-retention', jwtAuth, requireOwner, async (req, res) => {
	try {
		res.json(await settingsService.updateReportRetention(req.body?.days));
	} catch (error) {
		console.error('Failed to save report retention:', error);
		res.status(500).json({ error: 'Failed to save report retention' });
	}
});

router.post('/test-s3', jwtAuth, requireOwner, async (req, res) => {
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

router.get('/s3-backups', jwtAuth, requireOwner, async (req, res) => {
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

router.post('/s3-restore', restoreGate, async (req, res) => {
	try {
		const { key } = req.body;
		if (!key) return res.status(400).json({ error: 'Missing backup key' });

		// A from-scratch restore has no org row yet, so no stored S3 target either;
		// accept it inline in the request, the same fallback /test-s3 already allows.
		const config = (await settingsService.getOrgRaw()) ?? { ...req.body };
		const required = ['backupS3Bucket', 'backupS3AccessKey', 'backupS3SecretKey'];
		const missing = required.filter((k) => !config[k]);
		if (missing.length > 0) {
			return res
				.status(400)
				.json({ error: `S3 is not configured (missing: ${missing.join(', ')})` });
		}

		const data = await backupService.downloadFromS3(key, config);
		await backupService.importAll(data, cronService);
		res.json({ message: 'Restore successful' });
	} catch (error) {
		console.error('S3 restore failed:', error);
		res.status(500).json({ error: error.message || 'Restore failed' });
	}
});

router.post('/run-now', jwtAuth, requireOwner, async (req, res) => {
	try {
		const config = await settingsService.getOrgRaw();
		const missing = ['backupS3Bucket', 'backupS3AccessKey', 'backupS3SecretKey'].filter(
			(k) => !config[k]
		);
		if (missing.length > 0) {
			return res
				.status(400)
				.json({ error: `S3 is not configured (missing: ${missing.join(', ')})` });
		}
		await backupCronService.runBackup({ force: true });
		const after = await settingsService.getBackupConfig();
		if (after.backupLastStatus?.startsWith('error:')) {
			return res.status(500).json({ error: after.backupLastStatus.replace('error:', '') });
		}
		res.json({ ok: true, lastRunAt: after.backupLastRunAt, lastStatus: after.backupLastStatus });
	} catch (error) {
		console.error('Backup run-now failed:', error);
		res.status(500).json({ error: error.message || 'Backup failed' });
	}
});

module.exports = router;
