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
