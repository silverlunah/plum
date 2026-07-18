/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runnerService = require('../services/runnerService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { runnerOrAdmin } = require('../middleware/runnerOrAdmin');

// List/create are hit by headless CLI tools (manage-runners.mjs, node
// self-registration) with no session to present — same as before the
// runner-management routes were locked down. The response never includes
// runner tokens (toPublicRunner strips them), so listing isn't a secret leak.
router.get('/', async (req, res) => {
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

router.post('/', async (req, res) => {
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

router.delete('/:id', runnerOrAdmin, async (req, res) => {
	try {
		await runnerService.stop(req.params.id);
		await runnerService.remove(req.params.id);
		res.json({ message: 'Runner deleted' });
	} catch (e) {
		res.status(500).json({ error: 'Failed to delete runner' });
	}
});

router.post('/:id/ping', runnerOrAdmin, async (req, res) => {
	try {
		const result = await runnerService.ping(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/:id/stop', runnerOrAdmin, async (req, res) => {
	try {
		const result = await runnerService.stop(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/:id/restart', runnerOrAdmin, async (req, res) => {
	try {
		const result = await runnerService.restart(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

module.exports = router;
