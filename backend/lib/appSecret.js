/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_JWT_SECRET = 'plum-dev-secret-change-in-production';
const SECRET_FILE = path.join(process.cwd(), 'reports', '.plum-jwt-secret');

// An operator-set JWT_SECRET wins (needed for multi-replica). Otherwise persist
// a random one — a restart mustn't log everyone out, and no instance may run on
// the public default (with which anyone could forge an owner token).
function ensureJwtSecret() {
	const fromEnv = process.env.JWT_SECRET;
	if (fromEnv && fromEnv !== DEFAULT_JWT_SECRET) return fromEnv;

	try {
		const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
		if (saved) {
			process.env.JWT_SECRET = saved;
			return saved;
		}
	} catch {}

	const generated = crypto.randomBytes(48).toString('hex');
	try {
		fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
		fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
	} catch (e) {
		console.warn('⚠️  Could not persist JWT secret — sessions reset on restart:', e.message);
	}
	process.env.JWT_SECRET = generated;
	return generated;
}

module.exports = { ensureJwtSecret, DEFAULT_JWT_SECRET };
