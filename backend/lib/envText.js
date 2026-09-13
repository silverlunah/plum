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

// Names that steer the interpreter/process itself rather than the test under
// it, e.g. NODE_OPTIONS=--inspect on a run dispatched to the built-in runner
// spawns process.execPath IN THIS SAME CONTAINER (see runExecutorService.js's
// spawnBuiltInAttempt), so an override here reaches Plum's own process, not
// just the test's. Anyone who can start a run gets this override (no elevated
// role required), and so does the AI agent via its own run_tests tool, this
// has to be enforced at the one place both paths converge (enqueue below),
// not trusted to either caller.
const DANGEROUS_ENV_KEYS = new Set([
	'NODE_OPTIONS',
	'NODE_DEBUG',
	'NODE_DEBUG_NATIVE',
	'NODE_EXTRA_CA_CERTS',
	'NODE_PATH',
	'NODE_V8_COVERAGE',
	'NODE_REPL_EXTERNAL_MODULE',
	'PATH',
	'LD_PRELOAD',
	'LD_LIBRARY_PATH',
	'DYLD_INSERT_LIBRARIES',
	'DYLD_LIBRARY_PATH'
]);

// Throws rather than silently dropping the key: a rejected override should be
// obvious to whoever set it, not a run that quietly ignored what they typed.
function assertSafeEnvOverrides(overrides) {
	const blocked = Object.keys(overrides || {}).filter((k) =>
		DANGEROUS_ENV_KEYS.has(k.toUpperCase())
	);
	if (blocked.length > 0) {
		const e = new Error(`These env vars can't be overridden: ${blocked.join(', ')}`);
		e.status = 400;
		throw e;
	}
}

module.exports = { parseEnvText, assertSafeEnvOverrides };
