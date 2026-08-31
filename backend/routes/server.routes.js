/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireOwner } = require('../middleware/requireOwner');
const serverService = require('../services/serverService');

router.get('/update', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json(await serverService.checkUpdate());
	} catch (e) {
		next(e);
	}
});

module.exports = router;
