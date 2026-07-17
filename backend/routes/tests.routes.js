/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const testService = require('../services/testService');

/* -----------------------------------------------------
 *                   Get all tests
 *  Description:
 * 		Gets all suites and its own test cases in
 * 		 features/
 * ------------------------------------------------------ */
router.get('/', (req, res) => {
	const suites = testService.getTestSuites();
	res.json({ suites });
});

module.exports = router;
