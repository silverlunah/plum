/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const testCaseService = require('../services/testCaseService');
const testImportService = require('../services/testImportService');

router.use(jwtAuth, requireProjectAccess);

router.post('/import', requireAdmin, async (req, res, next) => {
	try {
		const result = await testImportService.importTestCases(
			req.projectId,
			req.body,
			req.user.userId
		);
		res.json(result);
	} catch (e) {
		if (e.status === 400) return res.status(400).json({ error: e.message });
		next(e);
	}
});

router.get('/:id', async (req, res, next) => {
	try {
		const tc = await testCaseService.getById(req.projectId, req.params.id);
		if (!tc) return res.status(404).json({ error: 'Test case not found' });
		res.json({ testCase: tc });
	} catch (e) {
		next(e);
	}
});

router.post('/', async (req, res, next) => {
	try {
		const { suiteId, title, description, priority } = req.body;
		if (!suiteId || !title) {
			return res.status(400).json({ error: 'suiteId and title are required' });
		}
		const testCase = await testCaseService.create(req.projectId, {
			suiteId,
			title,
			description,
			priority,
			createdById: req.user.userId
		});
		if (!testCase) return res.status(404).json({ error: 'Suite not found' });
		res.status(201).json({ testCase });
	} catch (e) {
		next(e);
	}
});

router.put('/:id', async (req, res, next) => {
	try {
		const { title, description, priority, suiteId } = req.body;
		const testCase = await testCaseService.update(req.projectId, req.params.id, {
			title,
			description,
			priority,
			suiteId
		});
		if (!testCase) return res.status(404).json({ error: 'Test case not found' });
		res.json({ testCase });
	} catch (e) {
		next(e);
	}
});

router.put('/:id/steps', async (req, res, next) => {
	try {
		const saved = await testCaseService.upsertSteps(req.projectId, req.params.id, req.body.steps);
		if (saved === null) return res.status(404).json({ error: 'Test case not found' });
		res.json({ steps: saved });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', async (req, res, next) => {
	try {
		await testCaseService.remove(req.projectId, req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
