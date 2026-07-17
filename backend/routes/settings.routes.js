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

router.get('/project', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const project = await settingsService.getProject();
		res.json(project);
	} catch (e) {
		next(e);
	}
});

router.post('/project', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const { name, logoUrl, timezone, maxRetries } = req.body;
		const project = await settingsService.updateProject({ name, logoUrl, timezone, maxRetries });
		res.json(project);
	} catch (e) {
		next(e);
	}
});

router.get('/test-prefixes', jwtAuth, async (req, res, next) => {
	try {
		const prefixes = await settingsService.getTestPrefixes();
		res.json(prefixes);
	} catch (e) {
		next(e);
	}
});

router.post('/test-prefixes', jwtAuth, async (req, res, next) => {
	try {
		const { testCasePrefix, testSuitePrefix } = req.body;
		const project = await settingsService.updateTestPrefixes({ testCasePrefix, testSuitePrefix });
		res.json(project);
	} catch (e) {
		next(e);
	}
});

router.post('/test-prefixes/migrate', jwtAuth, async (req, res, next) => {
	try {
		const { testCasePrefix, testSuitePrefix } = req.body;
		const results = {};
		if (testCasePrefix) {
			results.cases = await testCaseService.migratePrefix(testCasePrefix);
		}
		if (testSuitePrefix) {
			results.suites = await testSuiteService.migratePrefix(testSuitePrefix);
		}
		res.json({ ok: true, ...results });
	} catch (e) {
		next(e);
	}
});

router.get('/integrations', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const webhooks = await settingsService.getWebhooks();
		res.json(webhooks);
	} catch (e) {
		next(e);
	}
});

router.post('/integrations', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const { discordWebhookUrl, slackWebhookUrl, notifyPublicUrl } = req.body;
		const project = await settingsService.updateWebhooks({
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

router.get('/mcp', jwtAuth, async (req, res, next) => {
	try {
		const config = await settingsService.getMcpConfig();
		res.json(config);
	} catch (e) {
		next(e);
	}
});

router.post('/mcp/generate', jwtAuth, async (req, res, next) => {
	try {
		const config = await settingsService.generateMcpKey();
		res.json(config);
	} catch (e) {
		next(e);
	}
});

module.exports = router;
