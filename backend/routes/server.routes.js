/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireOwner } = require('../middleware/requireOwner');
const serverService = require('../services/serverService');
const { DEFAULT_FRAMEWORK, isFramework } = require('../constants/defaults');

router.get('/update', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json(await serverService.checkUpdate());
	} catch (e) {
		next(e);
	}
});

// Instance-wide defaults the UI needs before anything exists to read them from.
// Any signed-in user can see this; it is a preference, not a secret.
router.get('/defaults', jwtAuth, (req, res) => {
	const configured = process.env.PLUM_DEFAULT_FRAMEWORK;
	res.json({ framework: isFramework(configured) ? configured : DEFAULT_FRAMEWORK });
});

module.exports = router;
