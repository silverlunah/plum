/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const userService = require('../services/userService');

router.get('/members', jwtAuth, async (req, res, next) => {
	try {
		const users = await userService.getMembers();
		res.json({ users });
	} catch (e) {
		next(e);
	}
});

router.get('/', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const users = await userService.getAll();
		res.json({ users });
	} catch (e) {
		next(e);
	}
});

router.post('/', jwtAuth, requireAdmin, async (req, res, next) => {
	try {
		const { name, email, password, role = 'user' } = req.body;
		if (!name || !email || !password)
			return res.status(400).json({ error: 'name, email and password are required' });
		if (!['admin', 'user'].includes(role))
			return res.status(400).json({ error: 'role must be admin or user' });
		const user = await userService.createUser({ name, email, password, role });
		res.status(201).json({ user });
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', jwtAuth, requireAdmin, async (req, res, next) => {
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
