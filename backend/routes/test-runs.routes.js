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
const { jwtAuth } = require('../middleware/jwtAuth');
const testRunService = require('../services/testRunService');

router.get('/', jwtAuth, async (req, res, next) => {
	try {
		const runs = await testRunService.getAll();
		res.json({ runs });
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

router.delete('/:id', jwtAuth, async (req, res, next) => {
	try {
		await testRunService.remove(req.params.id);
		res.json({ ok: true });
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
