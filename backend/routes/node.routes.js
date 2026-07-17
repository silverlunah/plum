/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { authGuard } = require('../middleware/auth');
const nodeExecutionService = require('../services/nodeExecutionService');

// Health check — primary server uses this to confirm the node is reachable
router.get('/ping', authGuard, (req, res) => {
	res.json({ ok: true, mode: process.env.PLUM_MODE || 'server' });
});

// Graceful shutdown for node-mode processes (no-op on the primary server)
router.post('/shutdown', authGuard, (req, res) => {
	if (process.env.PLUM_MODE !== 'node') {
		return res.status(403).json({ error: 'Not a node runner' });
	}
	res.json({ ok: true });
	setTimeout(() => process.exit(0), 200);
});

// Self-restart for node-mode processes: spawns a replacement using this
// process's own env (RUNNER_ID/PORT/NODE_TOKEN), then exits. The replacement
// binds the same port, retrying past the brief EADDRINUSE window left by this
// process shutting down (see the listen retry in server.js).
router.post('/restart', authGuard, (req, res) => {
	if (process.env.PLUM_MODE !== 'node') {
		return res.status(403).json({ error: 'Not a node runner' });
	}
	const id = process.env.RUNNER_ID;
	if (!id) {
		return res.status(400).json({ error: 'Runner has no RUNNER_ID — cannot self-restart' });
	}
	res.json({ ok: true });
	setTimeout(() => {
		const { startNode } = require('../lib/runnerProcess');
		startNode({ id, port: process.env.PORT || '3001', token: process.env.NODE_TOKEN });
		process.exit(0);
	}, 200);
});

// Start a remote test job
router.post('/execute', authGuard, (req, res) => {
	const jobId = nodeExecutionService.startJob(req.body);
	res.json({ jobId, status: 'started' });
});

// Fetch the final report content after a job completes
router.get('/report/:jobId', authGuard, (req, res) => {
	const job = nodeExecutionService.getJob(req.params.jobId);
	if (!job) return res.status(404).json({ error: 'Job not found' });
	if (!job.reportContent) return res.status(404).json({ error: 'Report not ready' });
	res.json({ content: job.reportContent, meta: job.meta });
});

// Poll job status and streamed logs
router.get('/execute/:jobId', authGuard, (req, res) => {
	const offset = parseInt(req.query.offset || '0', 10);
	const result = nodeExecutionService.pollJob(req.params.jobId, offset);
	if (!result) return res.status(404).json({ error: 'Job not found' });
	res.json(result);
});

module.exports = router;
