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
const runnerService = require('../services/runnerService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

router.get('/', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const runners = await runnerService.getAll();
		res.json({ runners });
	} catch (e) {
		res.status(500).json({ error: 'Failed to fetch runners' });
	}
});

router.post('/probe', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { url, token } = req.body;
		if (!url || !token)
			return res.status(400).json({ ok: false, error: 'url and token are required' });
		const result = await runnerService.probe({ url, token });
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { name, url, token, browser } = req.body;
		if (!name || !url || !token)
			return res.status(400).json({ error: 'name, url and token are required' });
		const runner = await runnerService.create({ name, url, token, browser });
		res.status(201).json({ runner });
	} catch (e) {
		res.status(500).json({ error: 'Failed to create runner' });
	}
});

router.put('/:id', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { name, url, token, browser } = req.body;
		const runner = await runnerService.update(req.params.id, { name, url, token, browser });
		res.json({ runner });
	} catch (e) {
		res.status(500).json({ error: 'Failed to update runner' });
	}
});

router.delete('/:id', jwtAuth, requireAdmin, async (req, res) => {
	try {
		await runnerService.stop(req.params.id);
		await runnerService.remove(req.params.id);
		res.json({ message: 'Runner deleted' });
	} catch (e) {
		res.status(500).json({ error: 'Failed to delete runner' });
	}
});

router.post('/:id/ping', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const result = await runnerService.ping(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/:id/stop', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const result = await runnerService.stop(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/:id/restart', jwtAuth, requireAdmin, async (req, res) => {
	try {
		const result = await runnerService.restart(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

module.exports = router;
