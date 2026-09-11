/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Parses `.env`-style KEY=VALUE lines (one per line, `#` comments, quoted
// values) into a plain object. Shared so the run-override modal's textarea
// and a project's on-disk .env (lib/testsRoot.js) agree on one syntax.
function parseEnvText(text) {
	const out = {};
	for (const line of (text || '').split(/\r?\n/)) {
		if (/^\s*#/.test(line) || !line.trim()) continue;
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
		if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	return out;
}

module.exports = { parseEnvText };
