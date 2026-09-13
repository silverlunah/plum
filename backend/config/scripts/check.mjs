/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// `plum check`: the things Plum needs of a test suite that neither runner will
// complain about. A tag is an id here, so a repeated one cannot be told apart in
// a report, links the wrong case in the repository, and runs both tests when you
// ask for either. Playwright rejects a duplicate test *title* on its own; a
// duplicate tag it does not care about at all.
//
// The listing comes from each runner rather than from parsing files, so tags
// generated in a loop are read as the concrete values they end up being.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import pc from 'picocolors';

// Same shape Plum links reports to repository cases by (see reportService's
// isTestCaseTag), so `check` and the product agree on what an id looks like.
const ID_TAG = [/^@tc-?\d+/i, /^@test[\w-]*/i];

const matches = (tag, patterns) => patterns.some((re) => re.test(tag));
const withAt = (tag) => (tag.startsWith('@') ? tag : `@${tag}`);

/** The tests folder: this one if it looks like a project, else ./tests under it. */
function resolveTestsRoot() {
	const candidates = [
		process.env.TESTS_ROOT,
		process.cwd(),
		path.join(process.cwd(), 'tests')
	].filter(Boolean);
	for (const dir of candidates) {
		if (frameworkOf(dir)) return dir;
	}
	return null;
}

function frameworkOf(dir) {
	if (fs.existsSync(path.join(dir, 'playwright.config.ts'))) return 'playwright';
	if (fs.existsSync(path.join(dir, 'playwright.config.js'))) return 'playwright';
	if (fs.existsSync(path.join(dir, 'features'))) return 'cucumber';
	if (fs.existsSync(path.join(dir, 'cucumber.js'))) return 'cucumber';
	return null;
}

// npx is a .cmd shim on Windows, so this has to go through a shell.
function run(args, cwd) {
	return spawnSync('npx', args, {
		cwd,
		shell: true,
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024
	});
}

// Both runners print their listing as JSON on stdout, and Playwright still does
// when it refuses to list, with the reason in `errors`.
function parseJson(stdout) {
	const start = stdout.search(/[[{]/);
	if (start === -1) return null;
	try {
		return JSON.parse(stdout.slice(start));
	} catch {
		return null;
	}
}

function collectPlaywright(testsRoot) {
	const r = run(['playwright', 'test', '--list', '--reporter=json'], testsRoot);
	const listed = parseJson(r.stdout ?? '');
	if (!listed) {
		return {
			tests: [],
			files: 0,
			errors: [(r.stderr || r.stdout || 'playwright --list failed').trim()]
		};
	}
	const tests = [];
	const files = new Set();
	const walk = (node, file) => {
		const current = node.file ?? file;
		for (const spec of node.specs ?? []) {
			if (current) files.add(current);
			tests.push({
				// --list repeats a spec once per configured project. Same file, line and
				// title means the same test seen twice, whereas tests generated in a loop
				// share a line and differ by title, so they stay separate.
				key: `${current}:${spec.line}:${spec.title}`,
				where: `${current}:${spec.line}`,
				title: spec.title,
				tags: (spec.tags ?? []).map(withAt)
			});
		}
		for (const child of node.suites ?? []) walk(child, current);
	};
	for (const suite of listed.suites ?? []) walk(suite, suite.file ?? suite.title);
	return {
		tests,
		files: files.size,
		errors: (listed.errors ?? []).map((e) => (e.message ?? String(e)).split('\n')[0])
	};
}

function collectCucumber(testsRoot) {
	const r = run(['cucumber-js', '--dry-run', '--format', 'json'], testsRoot);
	const listed = parseJson(r.stdout ?? '');
	if (!listed) {
		return { tests: [], files: 0, errors: [(r.stderr || 'cucumber-js --dry-run failed').trim()] };
	}
	const tests = [];
	const files = new Set();
	for (const feature of listed) {
		if (feature.uri) files.add(feature.uri);
		for (const el of feature.elements ?? []) {
			// Background is reported as an element too, and it is not a test.
			if (el.type && el.type !== 'scenario') continue;
			tests.push({
				// A Scenario Outline's rows are reported as one element each, at their
				// own line but sharing the outline's id and its tag. That shared tag is
				// deliberate, so the rows count as one test here.
				key: el.id ?? `${feature.uri}:${el.line}`,
				where: `${feature.uri}:${el.line}`,
				title: el.name,
				tags: (el.tags ?? []).map((t) => withAt(t.name ?? String(t)))
			});
		}
	}
	return { tests, files: files.size, errors: [] };
}

function findProblems(listed) {
	const problems = [];
	const byTag = new Map();

	// One entry per logical test, so neither a second browser project nor an
	// outline's extra rows read as a repeated tag.
	const tests = [...new Map(listed.map((t) => [t.key, t])).values()];

	for (const test of tests) {
		const ids = test.tags.filter((t) => matches(t, ID_TAG));
		if (ids.length === 0) {
			problems.push({
				what: 'untagged test',
				detail: 'no @TC- tag, so it cannot be run or linked on its own',
				at: [test]
			});
		}
		for (const id of ids) {
			if (!byTag.has(id)) byTag.set(id, []);
			byTag.get(id).push(test);
		}
	}

	for (const [tag, owners] of byTag) {
		if (owners.length > 1) {
			problems.push({
				what: `duplicate tag ${tag}`,
				detail: 'a tag is an id: these cannot be told apart in a report',
				at: owners
			});
		}
	}

	return problems;
}

const countTests = (tests) => new Set(tests.map((t) => t.key)).size;

function main() {
	const testsRoot = resolveTestsRoot();
	if (!testsRoot) {
		console.error(
			pc.red('✗') +
				" no tests folder here. Run this in a project's tests folder, or the folder above it."
		);
		process.exit(1);
	}

	const framework = frameworkOf(testsRoot);
	console.log(`${pc.dim('checking')} ${pc.cyan(testsRoot)} ${pc.dim(`(${framework})`)}\n`);

	const { tests, files, errors } =
		framework === 'playwright' ? collectPlaywright(testsRoot) : collectCucumber(testsRoot);

	// A listing that failed is not a clean suite: the runner could not even read
	// it, which is also what leaves the Automated Tests page empty.
	for (const message of errors) {
		console.log(`${pc.red('✗')} ${pc.bold('the runner could not list your tests')}`);
		console.log(`    ${message}\n`);
	}

	const problems = findProblems(tests);
	for (const problem of problems) {
		console.log(`${pc.red('✗')} ${pc.bold(problem.what)}`);
		console.log(`    ${pc.dim(problem.detail)}`);
		for (const test of problem.at) {
			console.log(`    ${pc.cyan(test.where)}  ${pc.dim(`'${test.title}'`)}`);
		}
		console.log('');
	}

	const total = problems.length + errors.length;
	if (total === 0) {
		console.log(pc.green(`✓ ${countTests(tests)} tests in ${files} files, no problems`));
		return;
	}
	console.log(
		pc.red(`${total} problem${total === 1 ? '' : 's'}`) +
			pc.dim(` in ${files} file${files === 1 ? '' : 's'}`)
	);
	process.exit(1);
}

main();
