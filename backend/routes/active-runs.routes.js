/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runQueueService = require('../services/runQueueService');
const aiSessionService = require('../services/aiSessionService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { accessibleProjectIds } = require('../lib/projectContext');

function aiSessionsAsRuns(sessions) {
	return sessions.map((s) => ({
		runId: s.sessionId,
		projectId: s.projectId,
		projectName: s.projectName,
		status: 'running',
		kind: 'ai-session',
		label: s.title || 'AI session',
		runnerIds: [],
		position: 0,
		meta: { startedBy: s.startedBy },
		createdById: s.createdById,
		startedAt: s.startedAt
	}));
}

// Runs the caller can't reach are redacted to what the locked bottom-bar card
// renders (label, project, status, position): the tag, runner list and who
// started it are dropped.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		const [queued, sessions, accessible] = await Promise.all([
			runQueueService.listActive(),
			aiSessionService.listActiveSessions(),
			accessibleProjectIds(req.user)
		]);
		const runs = [...queued, ...aiSessionsAsRuns(sessions)];
		const visible = runs.map((r) =>
			accessible.includes(r.projectId)
				? r
				: {
						runId: r.runId,
						projectId: r.projectId,
						projectName: r.projectName,
						status: r.status,
						kind: r.kind,
						label: r.label,
						position: r.position
					}
		);
		res.json({ runs: visible });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
