/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { DEFAULT_JWT_SECRET } = require('./appSecret');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const STATE_TTL = '10m';

const jwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

// The OAuth `state` doubles as CSRF protection: it is a short-lived JWT we
// signed, so the callback can trust the `origin` it carries came from our own
// login page and not an attacker.
function signState(origin) {
	return jwt.sign({ nonce: crypto.randomBytes(16).toString('hex'), origin }, jwtSecret(), {
		expiresIn: STATE_TTL
	});
}

function verifyState(state) {
	try {
		return jwt.verify(state, jwtSecret());
	} catch {
		return null;
	}
}

function buildAuthUrl({ clientId, redirectUri, state }) {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state,
		prompt: 'select_account'
	});
	return `${AUTH_ENDPOINT}?${params}`;
}

// Throws if Google rejects the code exchange or the ID token fails verification.
async function identityFromCode({ clientId, clientSecret, redirectUri, code }) {
	const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
	const { tokens } = await client.getToken(code);
	const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
	const p = ticket.getPayload();
	return {
		googleId: p.sub,
		email: (p.email || '').toLowerCase(),
		emailVerified: p.email_verified === true,
		name: p.name || ''
	};
}

module.exports = { signState, verifyState, buildAuthUrl, identityFromCode };
