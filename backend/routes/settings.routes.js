/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const settingsService = require('../services/settingsService');
const testSuiteService = require('../services/testSuiteService');
const testCaseService = require('../services/testCaseService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');

const scoped = [jwtAuth, requireProjectAccess];
const scopedAdmin = [jwtAuth, requireProjectAccess, requireAdmin];

router.get('/project', scopedAdmin, async (req, res, next) => {
	try {
		res.json(await settingsService.getProject(req.projectId));
	} catch (e) {
		next(e);
	}
});

router.post('/project', scopedAdmin, async (req, res, next) => {
	try {
		const { name, logoUrl, timezone, baseUrl, maxRetries } = req.body;
		const project = await settingsService.updateProject(req.projectId, {
			name,
			logoUrl,
			timezone,
			baseUrl,
			maxRetries
		});
		res.json(project);
	} catch (e) {
		next(e);
	}
});

router.get('/test-prefixes', scoped, async (req, res, next) => {
	try {
		res.json(await settingsService.getTestPrefixes(req.projectId));
	} catch (e) {
		next(e);
	}
});

router.post('/test-prefixes', scoped, async (req, res, next) => {
	try {
		const { testCasePrefix, testSuitePrefix } = req.body;
		const project = await settingsService.updateTestPrefixes(req.projectId, {
			testCasePrefix,
			testSuitePrefix
		});
		res.json(project);
	} catch (e) {
		next(e);
	}
});

router.post('/test-prefixes/migrate', scoped, async (req, res, next) => {
	try {
		const { testCasePrefix, testSuitePrefix } = req.body;
		const results = {};
		if (testCasePrefix) {
			results.cases = await testCaseService.migratePrefix(req.projectId, testCasePrefix);
		}
		if (testSuitePrefix) {
			results.suites = await testSuiteService.migratePrefix(req.projectId, testSuitePrefix);
		}
		res.json({ ok: true, ...results });
	} catch (e) {
		next(e);
	}
});

router.get('/integrations', scopedAdmin, async (req, res, next) => {
	try {
		res.json(await settingsService.getWebhooks(req.projectId));
	} catch (e) {
		next(e);
	}
});

router.post('/integrations', scopedAdmin, async (req, res, next) => {
	try {
		const { discordWebhookUrl, slackWebhookUrl, notifyPublicUrl } = req.body;
		const project = await settingsService.updateWebhooks(req.projectId, {
			discordWebhookUrl,
			slackWebhookUrl,
			notifyPublicUrl
		});
		res.json({
			discordWebhookUrl: project.discordWebhookUrl,
			slackWebhookUrl: project.slackWebhookUrl,
			notifyPublicUrl: project.notifyPublicUrl
		});
	} catch (e) {
		next(e);
	}
});

// An MCP key acts as the member who minted it, with that member's role — so any
// member manages their own, no admin gate.
router.get('/mcp', scoped, async (req, res, next) => {
	try {
		res.json(await settingsService.getMcpConfig(req.projectId, req.user.userId));
	} catch (e) {
		next(e);
	}
});

router.post('/mcp/generate', scoped, async (req, res, next) => {
	try {
		res.json(await settingsService.generateMcpKey(req.projectId, req.user.userId));
	} catch (e) {
		next(e);
	}
});

router.delete('/mcp', scoped, async (req, res, next) => {
	try {
		await settingsService.revokeMcpKey(req.projectId, req.user.userId);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
