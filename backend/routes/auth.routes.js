/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const settingsService = require('../services/settingsService');
const { jwtAuth } = require('../middleware/jwtAuth');
const { rateLimit } = require('../middleware/rateLimit');
const { slugify } = require('../lib/slugify');
const { FRAMEWORKS, isFramework } = require('../constants/defaults');
const { signState, verifyState, buildAuthUrl, identityFromCode } = require('../lib/googleOAuth');

// Must match a redirect URI registered on the Google OAuth client.
// PLUM_OAUTH_REDIRECT_URI wins; otherwise the backend's own public URL
// (`plum server` writes PLUM_API_URL); otherwise the request, honouring a
// reverse proxy's forwarded headers. The last path guesses the scheme, which
// is why a proxy that omits X-Forwarded-Proto needs one of the first two.
function googleRedirectUri(req) {
	if (process.env.PLUM_OAUTH_REDIRECT_URI) return process.env.PLUM_OAUTH_REDIRECT_URI;
	if (process.env.PLUM_API_URL) {
		return `${process.env.PLUM_API_URL.replace(/\/+$/, '')}/auth/google/callback`;
	}
	const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
		.split(',')[0]
		.trim();
	const host = req.headers['x-forwarded-host'] || req.get('host');
	return `${proto}://${host}/auth/google/callback`;
}

// Bounce back to the login screen with the outcome in the URL fragment (never a
// query string — fragments don't reach server logs or the Referer header).
function backToLogin(res, origin, params) {
	const base = /^https?:\/\//.test(origin || '') ? origin : '';
	res.redirect(`${base}/login#${new URLSearchParams(params)}`);
}

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

// Public: what the login screen renders before anyone signs in — org name,
// logo, and which sign-in methods are available.
router.get('/branding', async (req, res, next) => {
	try {
		res.json(await settingsService.getPublicBranding());
	} catch (e) {
		next(e);
	}
});

router.post('/setup', async (req, res, next) => {
	try {
		if (!(await userService.needsSetup())) {
			return res.status(403).json({ error: 'Setup already complete' });
		}
		const {
			organizationName,
			projectName,
			name,
			email,
			password,
			termsAccepted,
			framework,
			githubToken,
			repo
		} = req.body;
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
			framework,
			githubToken,
			repo
		});
		res.status(201).json(await userService.login({ email, password }));
	} catch (e) {
		next(e);
	}
});

router.post('/login', loginLimiter, async (req, res, next) => {
	try {
		const { passwordLoginEnabled } = await settingsService.getPublicBranding();
		if (!passwordLoginEnabled) {
			return res.status(403).json({ error: 'Password sign-in is disabled for this organization.' });
		}
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

// Kicks off the Google OAuth dance. `origin` is the login page's own origin,
// carried through the signed state so the callback knows where to return.
router.get('/google', async (req, res, next) => {
	try {
		const { enabled, clientId } = await settingsService.getGoogleOAuthConfig();
		if (!enabled || !clientId) {
			return backToLogin(res, req.query.origin, { error: 'Google sign-in is not enabled.' });
		}
		const state = signState(String(req.query.origin || ''));
		res.redirect(buildAuthUrl({ clientId, redirectUri: googleRedirectUri(req), state }));
	} catch (e) {
		next(e);
	}
});

router.get('/google/callback', async (req, res, next) => {
	try {
		const claims = verifyState(req.query.state);
		const origin = claims?.origin || '';
		if (!claims) return backToLogin(res, origin, { error: 'Sign-in expired, please try again.' });
		if (req.query.error || !req.query.code) {
			return backToLogin(res, origin, { error: 'Google sign-in was cancelled.' });
		}

		const { enabled, clientId, clientSecret } = await settingsService.getGoogleOAuthConfig();
		if (!enabled || !clientId || !clientSecret) {
			return backToLogin(res, origin, { error: 'Google sign-in is not enabled.' });
		}

		let identity;
		try {
			identity = await identityFromCode({
				clientId,
				clientSecret,
				redirectUri: googleRedirectUri(req),
				code: req.query.code
			});
		} catch {
			return backToLogin(res, origin, { error: 'Could not verify your Google account.' });
		}

		const result = await userService.loginWithGoogle(identity);
		if (!result.ok) return backToLogin(res, origin, { error: result.error });
		backToLogin(res, origin, { token: result.token });
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
