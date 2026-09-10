/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const notificationInboxService = require('../services/notificationInboxService');
const { jwtAuth } = require('../middleware/jwtAuth');

// Every route here is scoped to the caller's own notifications, no project or
// admin gate: unlike everything else in Settings, there's nothing account-wide
// to protect, each row already belongs to exactly one user.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		res.json(await notificationInboxService.list(req.user.userId));
	} catch (e) {
		next(e);
	}
});

router.post('/:id/read', jwtAuth, async (req, res, next) => {
	try {
		const ok = await notificationInboxService.markRead(req.user.userId, req.params.id);
		if (!ok) return res.status(404).json({ error: 'Notification not found' });
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

router.post('/read-all', jwtAuth, async (req, res, next) => {
	try {
		await notificationInboxService.markAllRead(req.user.userId);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
