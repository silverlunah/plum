/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const projectService = require('../services/projectService');

// The switcher: projects the caller can reach.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		res.json({ projects: await projectService.listForUser(req.user) });
	} catch (e) {
		next(e);
	}
});

router.get('/all', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		res.json({ projects: await projectService.listAll() });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const { name, baseUrl } = req.body;
		if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
		res.status(201).json({ project: await projectService.create({ name: name.trim(), baseUrl }) });
	} catch (e) {
		next(e);
	}
});

router.get('/:id/members', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		res.json({ members: await projectService.getMembers(Number(req.params.id)) });
	} catch (e) {
		next(e);
	}
});

router.put('/:id/members', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const { userIds } = req.body;
		if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds must be an array' });
		res.json({ members: await projectService.setMembers(Number(req.params.id), userIds) });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
