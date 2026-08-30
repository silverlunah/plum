/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { requireOwner } = require('../middleware/requireOwner');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const activityService = require('../services/activityService');
const settingsService = require('../services/settingsService');
const { ACTIVITY_SCOPE } = require('../constants/activity');

const projectScoped = [jwtAuth, requireProjectAccess, requireAdmin];

function listParams(req) {
	return {
		page: Number(req.query.page) || 1,
		limit: Number(req.query.limit) || undefined,
		action: req.query.action || undefined,
		actorId: req.query.actorId || undefined,
		q: req.query.q || undefined
	};
}

// -- org feed: owner only ----------------------------------------------------

router.get('/org', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json(await activityService.list({ scope: ACTIVITY_SCOPE.ORG, ...listParams(req) }));
	} catch (e) {
		next(e);
	}
});

router.get('/org/filters', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json(await activityService.filterOptions({ scope: ACTIVITY_SCOPE.ORG }));
	} catch (e) {
		next(e);
	}
});

router.get('/retention', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json(await settingsService.getActivityRetention());
	} catch (e) {
		next(e);
	}
});

router.put('/retention', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json(await settingsService.updateActivityRetention(req.body?.days));
	} catch (e) {
		next(e);
	}
});

// -- project feed: that project's admins ------------------------------------

router.get('/filters', ...projectScoped, async (req, res, next) => {
	try {
		res.json(
			await activityService.filterOptions({
				scope: ACTIVITY_SCOPE.PROJECT,
				projectId: req.projectId
			})
		);
	} catch (e) {
		next(e);
	}
});

router.get('/', ...projectScoped, async (req, res, next) => {
	try {
		res.json(
			await activityService.list({
				scope: ACTIVITY_SCOPE.PROJECT,
				projectId: req.projectId,
				...listParams(req)
			})
		);
	} catch (e) {
		next(e);
	}
});

module.exports = router;
