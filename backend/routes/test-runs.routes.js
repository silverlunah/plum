/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const testRunService = require('../services/testRunService');

router.get('/', jwtAuth, async (req, res, next) => {
	try {
		const page = Math.max(1, parseInt(req.query.page) || 1);
		const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
		const { q, sortBy, sortOrder } = req.query;
		const result = await testRunService.getAll({ page, limit, q, sortBy, sortOrder });
		res.json(result);
	} catch (e) {
		next(e);
	}
});

router.get('/:id', jwtAuth, async (req, res, next) => {
	try {
		const run = await testRunService.getById(req.params.id);
		if (!run) return res.status(404).json({ error: 'Test run not found' });
		res.json({ run });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, async (req, res, next) => {
	try {
		const { title, caseIds } = req.body;
		if (!title) return res.status(400).json({ error: 'title is required' });
		const run = await testRunService.create({ title, caseIds, createdById: req.user.userId });
		res.status(201).json({ run });
	} catch (e) {
		next(e);
	}
});

router.put('/:id', jwtAuth, async (req, res, next) => {
	try {
		const { title, status, caseIds } = req.body;
		const run = await testRunService.update(req.params.id, { title, status, caseIds });
		res.json({ run });
	} catch (e) {
		next(e);
	}
});

router.post('/:id/duplicate', jwtAuth, async (req, res, next) => {
	try {
		const run = await testRunService.duplicate(req.params.id, { createdById: req.user.userId });
		if (!run) return res.status(404).json({ error: 'Test run not found' });
		res.status(201).json({ run });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', jwtAuth, async (req, res, next) => {
	try {
		await testRunService.remove(req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

router.put('/entries/:entryId/assign', jwtAuth, async (req, res, next) => {
	try {
		const { userId } = req.body;
		const entry = await testRunService.assignEntry(req.params.entryId, { userId: userId ?? null });
		res.json({ entry });
	} catch (e) {
		next(e);
	}
});

router.post('/entries/:entryId/result', jwtAuth, async (req, res, next) => {
	try {
		const { status, notes } = req.body;
		if (!status) return res.status(400).json({ error: 'status is required' });
		const entry = await testRunService.updateEntry(req.params.entryId, {
			status,
			notes,
			executedById: req.user.userId
		});
		res.json({ entry });
	} catch (e) {
		next(e);
	}
});

router.post('/:id/reorder', jwtAuth, async (req, res, next) => {
	try {
		const { entryIds } = req.body;
		if (!Array.isArray(entryIds))
			return res.status(400).json({ error: 'entryIds must be an array' });
		await testRunService.reorderEntries(req.params.id, entryIds);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
