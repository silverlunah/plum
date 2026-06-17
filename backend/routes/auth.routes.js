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
const userService = require('../services/userService');
const { jwtAuth } = require('../middleware/jwtAuth');

router.get('/needs-setup', async (req, res, next) => {
	try {
		const setup = await userService.needsSetup();
		res.json({ needsSetup: setup });
	} catch (e) {
		next(e);
	}
});

router.post('/setup', async (req, res, next) => {
	try {
		const setup = await userService.needsSetup();
		if (!setup) return res.status(403).json({ error: 'Setup already complete' });
		const { name, email, password } = req.body;
		if (!name || !email || !password)
			return res.status(400).json({ error: 'name, email and password are required' });
		const user = await userService.createUser({ name, email, password });
		res.status(201).json({ user });
	} catch (e) {
		next(e);
	}
});

router.post('/login', async (req, res, next) => {
	try {
		const { email, password } = req.body;
		if (!email || !password)
			return res.status(400).json({ error: 'email and password are required' });
		const result = await userService.login({ email, password });
		if (!result) return res.status(401).json({ error: 'Invalid credentials' });
		res.json(result);
	} catch (e) {
		next(e);
	}
});

router.get('/me', jwtAuth, async (req, res, next) => {
	try {
		const user = await userService.getById(req.user.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });
		res.json({ user });
	} catch (e) {
		next(e);
	}
});

router.post('/change-password', jwtAuth, async (req, res, next) => {
	try {
		const { currentPassword, newPassword } = req.body;
		if (!currentPassword || !newPassword)
			return res.status(400).json({ error: 'currentPassword and newPassword are required' });
		const result = await userService.updatePassword(req.user.userId, {
			currentPassword,
			newPassword
		});
		if (!result.ok) return res.status(400).json({ error: result.error });
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
