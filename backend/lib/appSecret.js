/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_JWT_SECRET = 'plum-dev-secret-change-in-production';
const REPORTS_DIR = path.join(process.cwd(), 'reports');

// Env value wins; otherwise a random secret persisted under the reports volume
// so it survives a restart. `envKey` equal to `defaultValue` counts as unset.
function ensureSecret(envKey, fileName, { defaultValue = null, bytes = 48 } = {}) {
	const fromEnv = process.env[envKey];
	if (fromEnv && fromEnv !== defaultValue) return fromEnv;

	const file = path.join(REPORTS_DIR, fileName);
	try {
		const saved = fs.readFileSync(file, 'utf8').trim();
		if (saved) {
			process.env[envKey] = saved;
			return saved;
		}
	} catch {}

	const generated = crypto.randomBytes(bytes).toString('hex');
	try {
		fs.mkdirSync(REPORTS_DIR, { recursive: true });
		fs.writeFileSync(file, generated, { mode: 0o600 });
	} catch (e) {
		console.warn(`⚠️  Could not persist ${envKey} — it will change on restart:`, e.message);
	}
	process.env[envKey] = generated;
	return generated;
}

// A generated default would let anyone forge tokens; a per-restart one would log
// everyone out. Set JWT_SECRET yourself for a multi-replica backend.
const ensureJwtSecret = () =>
	ensureSecret('JWT_SECRET', '.plum-jwt-secret', { defaultValue: DEFAULT_JWT_SECRET });

// Bearer credential for the /runners API — `plum node` / manage-nodes use it
// where there is no browser session.
const ensureNodeSecret = () => ensureSecret('PLUM_NODE_SECRET', '.plum-node-secret', { bytes: 32 });

module.exports = { ensureJwtSecret, ensureNodeSecret, DEFAULT_JWT_SECRET };
