/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Exercises the `plum` CLI the way a new user meets it: scaffold a project with
 * `plum init`, then drive it with the runner's own commands. Always runs this
 * checkout's bin/plum.js, never a globally installed plum, which is usually a
 * different version.
 *
 * --full adds the run-configuration matrix, the generators and a type-check.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLUM = path.join(ROOT, 'bin', 'plum.js');
const FULL = process.argv.includes('--full');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'plum-cli-test-'));

const results = [];
let failed = 0;

function record(name, ok, detail) {
	results.push({ name, ok, detail });
	if (!ok) failed++;
	console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
}

// npx and npm are .cmd shims on Windows, so these must go through a shell.
function sh(command, args, cwd) {
	const r = spawnSync(command, args, { cwd, shell: true, encoding: 'utf8' });
	return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function plum(args, cwd) {
	const r = spawnSync(process.execPath, [PLUM, ...args], { cwd, encoding: 'utf8' });
	return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const passedCount = (out) => {
	const m = out.match(/(\d+) passed/g);
	return m ? Number(m[m.length - 1].split(' ')[0]) : null;
};
const scenarioCount = (out) => {
	const m = out.match(/(\d+) scenarios? \((\d+) passed\)/);
	return m ? { total: Number(m[1]), passed: Number(m[2]) } : null;
};

function scaffold(framework) {
	const dir = path.join(WORK, framework);
	fs.mkdirSync(dir, { recursive: true });
	const r = plum(['init', '--framework', framework], dir);
	const tests = path.join(dir, 'tests');
	const installed = fs.existsSync(path.join(tests, 'node_modules'));
	record(`init ${framework}`, r.code === 0 && installed, installed ? '' : 'no tests/node_modules');
	// A first run must not need a manual npm install, so the headless flip is the
	// only edit this makes.
	const env = path.join(tests, '.env');
	if (fs.existsSync(env)) {
		fs.writeFileSync(
			env,
			fs.readFileSync(env, 'utf8').replace(/IS_HEADLESS=false/, 'IS_HEADLESS=true')
		);
	}
	return tests;
}

// Located rather than hardcoded: a line number goes stale the moment the example
// spec is edited, and a stale one fails as "selected 0 tests" instead of saying so.
function lineOf(tests, spec, needle) {
	const lines = fs.readFileSync(path.join(tests, spec), 'utf8').split('\n');
	return lines.findIndex((l) => l.includes(needle)) + 1;
}

function checkPlaywright(tests) {
	const all = sh('npx', ['playwright', 'test', '--project=chromium'], tests);
	record('playwright: full suite', all.code === 0, `${passedCount(all.out) ?? '?'} passed`);
	if (!FULL) return;

	const spec = 'specs/LoginPage.spec.ts';
	const soloLine = lineOf(tests, spec, 'User cannot log in with invalid credentials');

	const cases = [
		['by tag', ['playwright', 'test', '--project=chromium', '--grep', '@TC-001'], 1],
		['by file:line', ['playwright', 'test', '--project=chromium', `${spec}:${soloLine}`], 1],
		['firefox project', ['playwright', 'test', '--project=firefox', '--grep', '@TC-001'], 1],
		['4 workers, both browsers', ['playwright', 'test', '--workers=4'], 12],
		['shard 1/2', ['playwright', 'test', '--project=chromium', '--shard=1/2'], 3],
		['shard 2/2', ['playwright', 'test', '--project=chromium', '--shard=2/2'], 3],
		[
			'retries=1',
			['playwright', 'test', '--project=chromium', '--grep', '@TC-002', '--retries=1'],
			1
		]
	];
	for (const [label, args, expected] of cases) {
		const r = sh('npx', args, tests);
		const n = passedCount(r.out);
		record(
			`playwright: ${label}`,
			r.code === 0 && n === expected,
			`${n ?? '?'} passed, want ${expected}`
		);
	}

	const gen = plum(['create-test', '--name', 'Cart'], path.dirname(tests));
	record('playwright: create-test', gen.code === 0);
	const genRun = sh(
		'npx',
		['playwright', 'test', '--project=chromium', '--grep', '@test-cart-1'],
		tests
	);
	record(
		'playwright: generated test runs',
		genRun.code === 0,
		`${passedCount(genRun.out) ?? '?'} passed`
	);

	// create-step is Cucumber-only and must refuse rather than write a stray file.
	const step = plum(['create-step', '--name', 'Nope'], path.dirname(tests));
	record('playwright: create-step refused', step.code !== 0);

	const tsc = sh('npx', ['tsc', '--noEmit'], tests);
	record('playwright: tsc --noEmit', tsc.code === 0, tsc.code === 0 ? '' : tsc.out.split('\n')[0]);
}

function checkCucumber(tests) {
	const all = sh('npx', ['cucumber-js'], tests);
	const s = scenarioCount(all.out);
	record(
		'cucumber: full suite',
		all.code === 0 && !!s,
		s ? `${s.passed}/${s.total} scenarios` : '?'
	);
	if (!FULL) return;

	const cases = [
		['by tag', ['cucumber-js', '--tags', '@TC-001'], 1],
		['tag expression', ['cucumber-js', '--tags', '"@TC-002 or @TC-003"'], 4],
		['parallel 4', ['cucumber-js', '--parallel', '4'], 6]
	];
	for (const [label, args, expected] of cases) {
		const r = sh('npx', args, tests);
		const c = scenarioCount(r.out);
		record(
			`cucumber: ${label}`,
			r.code === 0 && c?.total === expected,
			`${c?.total ?? '?'} scenarios, want ${expected}`
		);
	}

	for (const browser of ['chromium', 'firefox', 'webkit']) {
		const r = spawnSync('npx', ['cucumber-js', '--tags', '@TC-001'], {
			cwd: tests,
			shell: true,
			encoding: 'utf8',
			env: { ...process.env, BROWSER: browser }
		});
		const c = scenarioCount(`${r.stdout ?? ''}${r.stderr ?? ''}`);
		record(`cucumber: BROWSER=${browser}`, r.status === 0 && c?.passed === 1);
	}

	const gen = plum(['create-test', '--name', 'Cart'], path.dirname(tests));
	record('cucumber: create-test', gen.code === 0);
	const genRun = sh('npx', ['cucumber-js', '--tags', '@test-cart-1'], tests);
	record(
		'cucumber: generated test runs',
		genRun.code === 0,
		`${scenarioCount(genRun.out)?.passed ?? '?'} passed`
	);

	const tsc = sh('npx', ['tsc', '--noEmit'], tests);
	record('cucumber: tsc --noEmit', tsc.code === 0, tsc.code === 0 ? '' : tsc.out.split('\n')[0]);
}

const started = Date.now();
console.log(`plum CLI test (${FULL ? 'full' : 'smoke'})`);
console.log(`workdir: ${WORK}\n`);

console.log('Playwright');
checkPlaywright(scaffold('playwright'));
console.log('\nCucumber');
checkCucumber(scaffold('cucumber'));

const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${results.length - failed}/${results.length} passed in ${secs}s`);
if (failed > 0) {
	console.log(`workdir kept for inspection: ${WORK}`);
	process.exit(1);
}
fs.rmSync(WORK, { recursive: true, force: true });
