/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const testRunService = require('../services/testRunService');
const exportService = require('../services/exportService');
const { sendExport, exportFormat } = require('../lib/exportResponse');

router.use(jwtAuth, requireProjectAccess);

router.get('/:id/export', async (req, res, next) => {
	try {
		const data = await exportService.buildTestCaseExport(req.projectId, 'run', {
			runId: req.params.id
		});
		if (!data) return res.status(404).json({ error: 'Test run not found' });
		await sendExport(res, {
			format: exportFormat(req),
			filenameBase: `run-${data.run?.title ?? req.params.id}`,
			json: () => data,
			csv: () => exportService.testCaseCsv(data)
		});
	} catch (e) {
		next(e);
	}
});

router.get('/', async (req, res, next) => {
	try {
		const page = Math.max(1, parseInt(req.query.page) || 1);
		const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
		const { q, sortBy, sortOrder } = req.query;
		res.json(await testRunService.getAll(req.projectId, { page, limit, q, sortBy, sortOrder }));
	} catch (e) {
		next(e);
	}
});

router.get('/:id', async (req, res, next) => {
	try {
		const run = await testRunService.getById(req.projectId, req.params.id);
		if (!run) return res.status(404).json({ error: 'Test run not found' });
		res.json({ run });
	} catch (e) {
		next(e);
	}
});

router.post('/', async (req, res, next) => {
	try {
		const { title, caseIds } = req.body;
		if (!title) return res.status(400).json({ error: 'title is required' });
		const run = await testRunService.create(req.projectId, {
			title,
			caseIds,
			createdById: req.user.userId
		});
		res.status(201).json({ run });
	} catch (e) {
		next(e);
	}
});

router.put('/:id', async (req, res, next) => {
	try {
		const { title, status, caseIds } = req.body;
		const run = await testRunService.update(req.projectId, req.params.id, {
			title,
			status,
			caseIds
		});
		if (!run) return res.status(404).json({ error: 'Test run not found' });
		res.json({ run });
	} catch (e) {
		next(e);
	}
});

router.post('/:id/duplicate', async (req, res, next) => {
	try {
		const run = await testRunService.duplicate(req.projectId, req.params.id, {
			createdById: req.user.userId
		});
		if (!run) return res.status(404).json({ error: 'Test run not found' });
		res.status(201).json({ run });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', async (req, res, next) => {
	try {
		await testRunService.remove(req.projectId, req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

router.put('/entries/:entryId/assign', async (req, res, next) => {
	try {
		const entry = await testRunService.assignEntry(req.projectId, req.params.entryId, {
			userId: req.body.userId ?? null
		});
		if (!entry) return res.status(404).json({ error: 'Entry not found' });
		res.json({ entry });
	} catch (e) {
		next(e);
	}
});

router.post('/entries/:entryId/result', async (req, res, next) => {
	try {
		const { status, notes } = req.body;
		if (!status) return res.status(400).json({ error: 'status is required' });
		const entry = await testRunService.updateEntry(req.projectId, req.params.entryId, {
			status,
			notes,
			executedById: req.user.userId
		});
		if (!entry) return res.status(404).json({ error: 'Entry not found' });
		res.json({ entry });
	} catch (e) {
		next(e);
	}
});

router.post('/:id/reorder', async (req, res, next) => {
	try {
		const { entryIds } = req.body;
		if (!Array.isArray(entryIds)) {
			return res.status(400).json({ error: 'entryIds must be an array' });
		}
		await testRunService.reorderEntries(req.projectId, req.params.id, entryIds);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
