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
