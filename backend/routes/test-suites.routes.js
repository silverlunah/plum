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
const testSuiteService = require('../services/testSuiteService');

router.get('/', jwtAuth, async (req, res, next) => {
	try {
		const suites =
			req.query.withCases === 'true'
				? await testSuiteService.getAllWithCases()
				: await testSuiteService.getAll();
		res.json({ suites });
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
