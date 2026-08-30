/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const testService = require('../services/testService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');

router.get('/', jwtAuth, requireProjectAccess, (req, res) => {
	res.json({ suites: testService.getTestSuites(req.projectId).suites });
});

module.exports = router;
