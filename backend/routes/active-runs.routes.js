/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runQueueService = require('../services/runQueueService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');

router.get('/', jwtAuth, requireProjectAccess, async (req, res, next) => {
	try {
		res.json({ runs: await runQueueService.listActive(req.projectId) });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
