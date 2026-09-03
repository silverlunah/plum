/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Contributor helper for a local runner fleet.
 *
 * `plum node start` already resolves the registration secret from the running
 * primary, so this only supplies the two things that are not guessable:
 * host.docker.internal, because the primary runs in Docker and cannot reach a
 * node on the host any other way, and --no-boot, because a scratch node should
 * not install a launch agent.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { listNodeNames } = require('../backend/lib/nodeRegister');

const ROOT = path.resolve(__dirname, '..');
const PLUM = path.join(ROOT, 'bin', 'plum.js');
const PRIMARY = process.env.PLUM_PRIMARY || 'http://localhost:3001';
const NODE_HOST = process.env.PLUM_NODE_HOST || 'host.docker.internal';
const FIRST_PORT = Number(process.env.PLUM_FIRST_PORT || 9001);
const PREFIX = 'dev-';
const DEFAULT_COUNT = 2;

function plum(args, { allowFail = false } = {}) {
	try {
		execFileSync(process.execPath, [PLUM, ...args], { cwd: ROOT, stdio: 'inherit' });
		return true;
	} catch (e) {
		if (!allowFail) throw e;
		console.error(`  (continuing) plum ${args.join(' ')} failed: ${e.message}`);
		return false;
	}
}

async function primaryReachable() {
	try {
		await fetch(PRIMARY, { signal: AbortSignal.timeout(3000) });
		return true;
	} catch {
		return false;
	}
}

async function up(count) {
	if (!(await primaryReachable())) {
		console.error(`No server at ${PRIMARY}. Start it first: npm run docker:up`);
		process.exit(1);
	}
	for (let i = 0; i < count; i++) {
		const port = FIRST_PORT + i;
		plum([
			'node',
			'start',
			`${PREFIX}${i + 1}`,
			'--mode',
			'local',
			'--primary',
			PRIMARY,
			'--url',
			`http://${NODE_HOST}:${port}`,
			'--port',
			String(port),
			'--browser',
			'chromium',
			'--no-boot'
		]);
	}
	plum(['node', 'list']);
}

// Only this script's own nodes: a contributor may have registered others here.
function down() {
	const mine = listNodeNames().filter((n) => n.startsWith(PREFIX));
	if (mine.length === 0) {
		console.log(`No ${PREFIX}* nodes on this machine.`);
		return;
	}
	for (const name of mine) plum(['node', 'delete', name], { allowFail: true });
}

async function main() {
	const [cmd, countArg] = process.argv.slice(2);
	if (cmd === 'up') return up(Math.max(1, Number(countArg) || DEFAULT_COUNT));
	if (cmd === 'down') return down();
	if (cmd === 'list') return void plum(['node', 'list']);
	console.error('Usage: node scripts/nodes.js <up [count] | down | list>');
	process.exit(1);
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
