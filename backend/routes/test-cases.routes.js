/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const testCaseService = require('../services/testCaseService');

router.get('/:id', jwtAuth, async (req, res, next) => {
	try {
		const tc = await testCaseService.getById(req.params.id);
		if (!tc) return res.status(404).json({ error: 'Test case not found' });
		res.json({ testCase: tc });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, async (req, res, next) => {
	try {
		const { suiteId, title, description, priority } = req.body;
		if (!suiteId || !title)
			return res.status(400).json({ error: 'suiteId and title are required' });
		const testCase = await testCaseService.create({
			suiteId,
			title,
			description,
			priority,
			createdById: req.user.userId
		});
		res.status(201).json({ testCase });
	} catch (e) {
		next(e);
	}
});

router.put('/:id', jwtAuth, async (req, res, next) => {
	try {
		const { title, description, priority } = req.body;
		const testCase = await testCaseService.update(req.params.id, { title, description, priority });
		res.json({ testCase });
	} catch (e) {
		next(e);
	}
});

router.put('/:id/steps', jwtAuth, async (req, res, next) => {
	try {
		const { steps } = req.body;
		const saved = await testCaseService.upsertSteps(req.params.id, steps);
		res.json({ steps: saved });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', jwtAuth, async (req, res, next) => {
	try {
		await testCaseService.remove(req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
