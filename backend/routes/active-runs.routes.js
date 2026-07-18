/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const activeRunsService = require('../services/activeRunsService');
const { jwtAuth } = require('../middleware/jwtAuth');

// Runs carry a real user's display name (`startedBy`) — gate this the same way as
// other identity-bearing routes (test-suites, test-runs, users), not left open like
// the purely operational GET routes (reports, tests) that never touch user identity.
router.get('/', jwtAuth, (req, res) => {
	res.json({ runs: activeRunsService.listActiveRuns() });
});

module.exports = router;
