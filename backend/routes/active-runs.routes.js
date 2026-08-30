/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const runQueueService = require('../services/runQueueService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { accessibleProjectIds } = require('../lib/projectContext');

// Returns every active run across every project (the bottom bar shows all of
// them for awareness) plus the ids of the projects this user can actually open.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		const [runs, accessible] = await Promise.all([
			runQueueService.listActive(),
			accessibleProjectIds(req.user)
		]);
		res.json({ runs, accessibleProjectIds: accessible });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
