/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runQueueService = require('../services/runQueueService');
const { jwtAuth } = require('../middleware/jwtAuth');

// Queued + running rows carry a real user's display name (`startedBy`) — gate
// this the same way as other identity-bearing routes, not left open like the
// purely operational GET routes.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		res.json({ runs: await runQueueService.listActive() });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
