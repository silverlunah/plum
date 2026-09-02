/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_JWT_SECRET = 'plum-dev-secret-change-in-production';
// Anchored to backend/, not cwd: a process started from the repo root must not
// scatter a second reports/ (and its secrets) there.
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

// Env value wins; otherwise a random secret persisted under the reports volume
// so it survives a restart. `envKey` equal to `defaultValue` counts as unset.
function ensureSecret(envKey, fileName, { defaultValue = null, bytes = 48 } = {}) {
	const fromEnv = process.env[envKey];
	if (fromEnv && fromEnv !== defaultValue) return fromEnv;

	const file = path.join(REPORTS_DIR, fileName);
	try {
		// The real secret is one line. Take the last non-blank line so a stray
		// license header (see license-config.json) prepended to the file doesn't
		// silently corrupt the value and log everyone out.
		const saved = fs
			.readFileSync(file, 'utf8')
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean)
			.pop();
		if (saved && /^[A-Za-z0-9+/=_-]{16,}$/.test(saved)) {
			process.env[envKey] = saved;
			return saved;
		}
	} catch {}

	const generated = crypto.randomBytes(bytes).toString('hex');
	try {
		fs.mkdirSync(REPORTS_DIR, { recursive: true });
		fs.writeFileSync(file, generated, { mode: 0o600 });
	} catch (e) {
		console.warn(`⚠️  Could not persist ${envKey}: it will change on restart:`, e.message);
	}
	process.env[envKey] = generated;
	return generated;
}

// Forces a fresh value, overwriting the persisted file and process.env. Only the
// node secret is regenerable from the UI: the JWT secret can't be without
// logging everyone out.
function regenerateSecret(envKey, fileName, { bytes = 48 } = {}) {
	const generated = crypto.randomBytes(bytes).toString('hex');
	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	fs.writeFileSync(path.join(REPORTS_DIR, fileName), generated, { mode: 0o600 });
	process.env[envKey] = generated;
	return generated;
}

// A generated default would let anyone forge tokens; a per-restart one would log
// everyone out. Set JWT_SECRET yourself for a multi-replica backend.
const ensureJwtSecret = () =>
	ensureSecret('JWT_SECRET', '.plum-jwt-secret', { defaultValue: DEFAULT_JWT_SECRET });

// Bearer credential for the /runners API, `plum node` / manage-nodes use it
// where there is no browser session.
const ensureNodeSecret = () => ensureSecret('PLUM_NODE_SECRET', '.plum-node-secret', { bytes: 32 });
const regenerateNodeSecret = () =>
	regenerateSecret('PLUM_NODE_SECRET', '.plum-node-secret', { bytes: 32 });

module.exports = { ensureJwtSecret, ensureNodeSecret, regenerateNodeSecret, DEFAULT_JWT_SECRET };
