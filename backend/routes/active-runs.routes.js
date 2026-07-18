/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
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
