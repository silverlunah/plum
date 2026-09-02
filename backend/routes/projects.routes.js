/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireOwner } = require('../middleware/requireOwner');
const projectService = require('../services/projectService');
const { FRAMEWORKS, isFramework } = require('../constants/defaults');
const { slugify } = require('../lib/slugify');

// Owner, or an admin assigned to the project named by :id.
async function requireProjectAdmin(req, res, next) {
	try {
		if (await projectService.canAdminister(req.user, Number(req.params.id))) return next();
		res.status(403).json({ error: 'Admin access required' });
	} catch (e) {
		next(e);
	}
}

// The switcher: projects the caller can reach.
router.get('/', jwtAuth, async (req, res, next) => {
	try {
		res.json({ projects: await projectService.listForUser(req.user) });
	} catch (e) {
		next(e);
	}
});

router.get('/all', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		res.json({ projects: await projectService.listAll() });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		const name = (req.body.name || '').trim();
		if (!name) return res.status(400).json({ error: 'name is required' });
		if (!slugify(name))
			return res
				.status(400)
				.json({ error: 'Project name needs at least one letter or number (a–z, 0–9)' });
		const framework = req.body.framework;
		if (framework !== undefined && !isFramework(framework)) {
			return res.status(400).json({ error: `framework must be one of: ${FRAMEWORKS.join(', ')}` });
		}
		res.status(201).json({ project: await projectService.create({ name, framework }) });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		const result = await projectService.remove(Number(req.params.id));
		if (!result.ok) return res.status(400).json({ error: result.error });
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

router.get('/:id/members', jwtAuth, requireProjectAdmin, async (req, res, next) => {
	try {
		res.json({ members: await projectService.getMembers(Number(req.params.id)) });
	} catch (e) {
		next(e);
	}
});

router.put('/:id/members', jwtAuth, requireProjectAdmin, async (req, res, next) => {
	try {
		const { userIds } = req.body;
		if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds must be an array' });
		res.json({ members: await projectService.setMembers(Number(req.params.id), userIds) });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
