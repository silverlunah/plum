/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireOwner } = require('../middleware/requireOwner');
const { requireAdmin } = require('../middleware/requireAdmin');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const userService = require('../services/userService');

// Who can be assigned work in the active project — its members plus the owner.
router.get('/members', jwtAuth, requireProjectAccess, async (req, res, next) => {
	try {
		res.json({ users: await userService.getProjectMembers(req.projectId) });
	} catch (e) {
		next(e);
	}
});

// The whole pool an owner/admin can add to a project.
router.get('/assignable', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		res.json({ users: await userService.getAssignablePool() });
	} catch (e) {
		next(e);
	}
});

router.get('/', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		const users = await userService.getAll();
		res.json({ users });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		const { name, email, password, role = 'user' } = req.body;
		if (!name || !email || !password)
			return res.status(400).json({ error: 'name, email and password are required' });
		if (!['owner', 'admin', 'user'].includes(role))
			return res.status(400).json({ error: 'role must be owner, admin or user' });
		const user = await userService.createUser({ name, email, password, role });
		res.status(201).json({ user });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', jwtAuth, requireOwner, async (req, res, next) => {
	try {
		if (req.params.id === req.user.userId)
			return res.status(400).json({ error: 'Cannot delete your own account' });
		await userService.deleteUser(req.params.id);
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
