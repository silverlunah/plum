/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runnerService = require('../services/runnerService');
const settingsService = require('../services/settingsService');
const appSecret = require('../lib/appSecret');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireOwner } = require('../middleware/requireOwner');
const { nodeControlAuth, nodeReadAuth } = require('../middleware/nodeControlAuth');

// An open POST /runners let anyone register a rogue node, which then received
// the test tree and env secrets on dispatch: mutation is owner/secret-gated.
// Listing is open to any member so they can target a node for a run.
router.get('/', nodeReadAuth, async (req, res) => {
	try {
		const runners = await runnerService.getAll();
		res.json({ runners });
	} catch (e) {
		res.status(500).json({ error: 'Failed to fetch runners' });
	}
});

// Instance-wide "run on the primary" switch: every member reads it, the owner sets it.
router.get('/built-in', jwtAuth, async (req, res) => {
	try {
		res.json(await settingsService.getBuiltInRunnerEnabled());
	} catch (e) {
		res.status(500).json({ error: 'Failed to fetch built-in runner setting' });
	}
});

router.put('/built-in', jwtAuth, requireOwner, async (req, res) => {
	try {
		res.json(await settingsService.updateBuiltInRunnerEnabled(req.body.enabled));
	} catch (e) {
		res.status(500).json({ error: 'Failed to update built-in runner setting' });
	}
});

// The node-registration secret, shown so an owner can set up a remote node
// without shelling into the container. Owner-gated, like the MCP key.
router.get('/node-secret', jwtAuth, requireOwner, (req, res) => {
	res.json({ nodeSecret: process.env.PLUM_NODE_SECRET ?? null });
});

router.post('/node-secret/regenerate', jwtAuth, requireOwner, async (req, res) => {
	try {
		const nodeSecret = appSecret.regenerateNodeSecret();
		const push = await runnerService.pushNodeSecret(nodeSecret);
		res.json({ nodeSecret, ...push });
	} catch (e) {
		res.status(500).json({ error: 'Failed to regenerate the node secret' });
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
