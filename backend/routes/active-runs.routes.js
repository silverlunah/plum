/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runQueueService = require('../services/runQueueService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { accessibleProjectIds } = require('../lib/projectContext');

// Every active run across every project — the bottom bar shows them all for
// awareness. Runs in a project the caller can't open are redacted to just what
// the locked card renders (label, project, status, queue position); the tag,
// runner list and who started it are dropped.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		const [runs, accessible] = await Promise.all([
			runQueueService.listActive(),
			accessibleProjectIds(req.user)
		]);
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
