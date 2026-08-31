/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runnerService = require('../services/runnerService');
const { nodeControlAuth } = require('../middleware/nodeControlAuth');

// An open POST /runners let anyone register a rogue node, which then received
// the test tree and env secrets on dispatch — every route is now gated.
router.get('/', nodeControlAuth, async (req, res) => {
	try {
		const runners = await runnerService.getAll();
		res.json({ runners });
	} catch (e) {
		res.status(500).json({ error: 'Failed to fetch runners' });
	}
});

router.post('/', nodeControlAuth, async (req, res) => {
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

router.delete('/:id', nodeControlAuth, async (req, res) => {
	try {
		await runnerService.stop(req.params.id);
		await runnerService.remove(req.params.id);
		res.json({ message: 'Runner deleted' });
	} catch (e) {
		res.status(500).json({ error: 'Failed to delete runner' });
	}
});

router.post('/:id/ping', nodeControlAuth, async (req, res) => {
	try {
		const result = await runnerService.ping(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/:id/stop', nodeControlAuth, async (req, res) => {
	try {
		const result = await runnerService.stop(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

router.post('/:id/restart', nodeControlAuth, async (req, res) => {
	try {
		const result = await runnerService.restart(req.params.id);
		res.json(result);
	} catch (e) {
		res.status(500).json({ ok: false, error: e.message });
	}
});

module.exports = router;
