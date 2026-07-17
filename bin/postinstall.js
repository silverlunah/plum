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

/**
 * Runs on every `npm install` of this package (including `npm i -g plum-e2e`
 * and re-installs on update), so `plum mcp` and other backend-dependent
 * commands work immediately without the user first having to run `plum
 * server start` or `plum node start` — the only commands that used to trigger
 * a backend `npm install` on their own.
 *
 * Best-effort: a failure here must not fail the overall `npm install`, so
 * errors are logged, not thrown.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

try {
	const { ensureBackendDeps } = require(
		path.join(__dirname, '..', 'backend', 'lib', 'runnerProcess.js')
	);
	ensureBackendDeps();
} catch (e) {
	console.warn(`[plum] Could not install backend dependencies automatically: ${e.message}`);
	console.warn(
		'[plum] If `plum mcp` fails to start, run `npm install` inside its backend/ folder.'
	);
}
