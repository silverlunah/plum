/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const testSuiteService = require('../services/testSuiteService');

router.get('/', jwtAuth, async (req, res, next) => {
	try {
		if (req.query.withCases === 'true') {
			const suites = await testSuiteService.getAllWithCases();
			return res.json({ suites });
		}
		if (req.query.q) {
			const results = await testSuiteService.search(req.query.q);
			return res.json(results);
		}
		const page = Math.max(1, parseInt(req.query.page) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
		const { sortBy, sortOrder } = req.query;
		const result = await testSuiteService.getAll({ page, limit, sortBy, sortOrder });
		res.json(result);
	} catch (e) {
		next(e);
	}
});

router.get('/:id', jwtAuth, async (req, res, next) => {
	try {
		const suite = await testSuiteService.getById(req.params.id);
		if (!suite) return res.status(404).json({ error: 'Suite not found' });
		res.json({ suite });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, async (req, res, next) => {
	try {
		const { name, description, priority } = req.body;
		if (!name) return res.status(400).json({ error: 'name is required' });
		const suite = await testSuiteService.create({
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

router.put('/:id', jwtAuth, async (req, res, next) => {
	try {
		const { name, description, priority } = req.body;
		const suite = await testSuiteService.update(req.params.id, {
			name,
			description,
			priority
		});
		res.json({ suite });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', jwtAuth, async (req, res, next) => {
	try {
		await testSuiteService.remove(req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
