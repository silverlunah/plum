/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parses a dir's `.env` into a plain object. Used to hand a remote runner node
 * the same BASE_URL/IS_HEADLESS/custom test vars the primary has, so nodes stay
 * stateless runners instead of needing their own local `.env`.
 */
function loadTestEnv(dir) {
	const out = {};
	try {
		const txt = fs.readFileSync(path.join(dir, '.env'), 'utf8');
		for (const line of txt.split(/\r?\n/)) {
			const m = line.match(/^([A-Za-z_]\w*)\s*=\s*(.*?)(\s*#.*)?$/);
			if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
		}
	} catch {}
	return out;
}

module.exports = { loadTestEnv };
