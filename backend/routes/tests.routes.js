/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const testService = require('../services/testService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');

router.get('/', jwtAuth, requireProjectAccess, async (req, res, next) => {
	try {
		const { suites, error } = await testService.getTestSuites(req.projectId);
		// `error` means the runner refused to list the files, which is not the same
		// as having no tests: the page says so instead of looking empty.
		res.json({ suites, ...(error && { error }) });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
