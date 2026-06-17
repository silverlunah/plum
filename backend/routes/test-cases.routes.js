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
		const { suiteId, title, description, priority, automatedTag } = req.body;
		if (!suiteId || !title)
			return res.status(400).json({ error: 'suiteId and title are required' });
		const testCase = await testCaseService.create({
			suiteId,
			title,
			description,
			priority,
			automatedTag,
			createdById: req.user.userId
		});
		res.status(201).json({ testCase });
	} catch (e) {
		next(e);
	}
});

router.put('/:id', jwtAuth, async (req, res, next) => {
	try {
		const { title, description, priority, automatedTag } = req.body;
		const testCase = await testCaseService.update(req.params.id, {
			title,
			description,
			priority,
			automatedTag
		});
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
