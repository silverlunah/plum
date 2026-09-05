/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { rateLimit } = require('../middleware/rateLimit');
const { slugify } = require('../lib/slugify');
const { FRAMEWORKS, isFramework } = require('../constants/defaults');

const loginLimiter = rateLimit({
	windowMs: 15 * 60_000,
	max: 10,
	key: (req) => `${req.ip || ''}|${(req.body?.email || '').toLowerCase()}`
});

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
		if (!(await userService.needsSetup())) {
			return res.status(403).json({ error: 'Setup already complete' });
		}
		const { organizationName, projectName, name, email, password, termsAccepted, framework } =
			req.body;
		if (!organizationName || !projectName || !name || !email || !password) {
			return res.status(400).json({
				error: 'organizationName, projectName, name, email and password are required'
			});
		}
		if (termsAccepted !== true) {
			return res.status(400).json({ error: 'The first-run notice must be accepted' });
		}
		if (!slugify(projectName)) {
			return res
				.status(400)
				.json({ error: 'Project name needs at least one letter or number (a–z, 0–9)' });
		}
		if (framework !== undefined && !isFramework(framework)) {
			return res.status(400).json({ error: `framework must be one of: ${FRAMEWORKS.join(', ')}` });
		}
		await userService.bootstrap({
			organizationName,
			projectName,
			name,
			email,
			password,
			framework
		});
		res.status(201).json(await userService.login({ email, password }));
	} catch (e) {
		next(e);
	}
});

router.post('/login', loginLimiter, async (req, res, next) => {
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

router.put('/update-profile', jwtAuth, async (req, res, next) => {
	try {
		const { name, email, defaultProjectId } = req.body;
		const result = await userService.updateProfile(
			req.user.userId,
			{ name, email, defaultProjectId },
			req.user
		);
		if (!result.ok) return res.status(400).json({ error: result.error });
		res.json({ user: result.user });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
