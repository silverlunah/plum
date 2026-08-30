/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const testSuiteService = require('../services/testSuiteService');
const exportService = require('../services/exportService');
const { sendExport, exportFormat } = require('../lib/exportResponse');

router.use(jwtAuth, requireProjectAccess);

const testCaseRenderers = (data) => ({
	json: () => data,
	csv: () => exportService.testCaseCsv(data)
});

router.get('/export', async (req, res, next) => {
	try {
		const data = await exportService.buildTestCaseExport(req.projectId, 'all');
		await sendExport(res, {
			format: exportFormat(req),
			filenameBase: 'test-cases',
			...testCaseRenderers(data)
		});
	} catch (e) {
		next(e);
	}
});

router.get('/:id/export', async (req, res, next) => {
	try {
		const data = await exportService.buildTestCaseExport(req.projectId, 'suite', {
			suiteId: req.params.id
		});
		if (!data) return res.status(404).json({ error: 'Suite not found' });
		await sendExport(res, {
			format: exportFormat(req),
			filenameBase: `suite-${data.suites[0]?.displayId ?? req.params.id}`,
			...testCaseRenderers(data)
		});
	} catch (e) {
		next(e);
	}
});

router.get('/', async (req, res, next) => {
	try {
		if (req.query.withCases === 'true') {
			return res.json({ suites: await testSuiteService.getAllWithCases(req.projectId) });
		}
		if (req.query.q) {
			return res.json(await testSuiteService.search(req.projectId, req.query.q));
		}
		const page = Math.max(1, parseInt(req.query.page) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
		const { sortBy, sortOrder } = req.query;
		res.json(await testSuiteService.getAll(req.projectId, { page, limit, sortBy, sortOrder }));
	} catch (e) {
		next(e);
	}
});

router.get('/:id', async (req, res, next) => {
	try {
		const suite = await testSuiteService.getById(req.projectId, req.params.id);
		if (!suite) return res.status(404).json({ error: 'Suite not found' });
		res.json({ suite });
	} catch (e) {
		next(e);
	}
});

router.post('/', async (req, res, next) => {
	try {
		const { name, description, priority } = req.body;
		if (!name) return res.status(400).json({ error: 'name is required' });
		const suite = await testSuiteService.create(req.projectId, {
			name,
			description,
			priority,
			createdById: req.user.userId
		});
		res.status(201).json({ suite });
	} catch (e) {
		next(e);
	}
});

router.put('/:id', async (req, res, next) => {
	try {
		const { name, description, priority } = req.body;
		const suite = await testSuiteService.update(req.projectId, req.params.id, {
			name,
			description,
			priority
		});
		if (!suite) return res.status(404).json({ error: 'Suite not found' });
		res.json({ suite });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', async (req, res, next) => {
	try {
		await testSuiteService.remove(req.projectId, req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
