/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { execFile } = require('child_process');
const { declaredForFile } = require('./playwrightSteps');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

// The repository page, the run bar and the chunker all ask for the same list, so it
// is cached per tests folder and invalidated by the newest mtime under it.
const cache = new Map();

// Playwright reports tags without the leading @ ("TC-001"); Plum's test ids carry
// it, and every tag the UI shows or passes to --grep is @-prefixed.
const withAt = (tag) => (tag.startsWith('@') ? tag : `@${tag}`);

function newestMtime(dir) {
	let newest = 0;
	const walk = (d) => {
		let entries;
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			const full = path.join(d, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (/\.(ts|js|mts|cts)$/.test(entry.name)) {
				try {
					newest = Math.max(newest, fs.statSync(full).mtimeMs);
				} catch {}
			}
		}
	};
	walk(dir);
	return newest;
}

const execFileAsync = promisify(execFile);

// Loading every spec file costs about a second, so this must not block the event
// loop: it runs inside HTTP handlers and once per project at boot.
async function listSpecs(testsRoot) {
	const { stdout } = await execFileAsync(
		'npx',
		['playwright', 'test', '--list', '--reporter=json'],
		{
			cwd: testsRoot,
			encoding: 'utf8',
			shell: true,
			maxBuffer: 32 * 1024 * 1024,
			env: { ...process.env, PLUM_REPORT_FILE: '' }
		}
	);
	return JSON.parse(stdout);
}

/**
 * Playwright's spec list in the shape the repository UI and the chunker already
 * consume: { suites: [{ suiteName, suiteId, tests: [{ id, testCase, type, steps }] }] }.
 *
 * A describe block becomes a suite and its tag becomes the suite id, which mirrors
 * how a .feature file's Feature-level tag does. A file with no describe becomes one
 * suite named after the file. `steps` are the test.step() calls the spec declares,
 * read from its source: Playwright's --list reports none, because a step is a
 * runtime call rather than metadata.
 */
async function getPlaywrightSuites(testsRoot) {
	if (!fs.existsSync(testsRoot)) return { suites: [], projects: [] };

	const stamp = newestMtime(testsRoot);
	const hit = cache.get(testsRoot);
	if (hit && hit.stamp === stamp) return hit.value;

	let listed;
	try {
		listed = await listSpecs(testsRoot);
	} catch (e) {
		// A spec that does not compile, or a missing config, surfaced as an empty
		// list rather than a 500, the same way an unreadable feature file is.
		console.error(`[discovery] playwright --list failed in ${testsRoot}: ${e.message}`);
		return { suites: [], projects: [] };
	}

	// One parse per spec file, shared by every spec in it. rootDir is the config's
	// testDir, and a suite's `file` is relative to it.
	const rootDir = listed.config?.rootDir || testsRoot;
	const parsedFiles = new Map();
	const EMPTY = { tests: new Map(), suites: new Map() };
	const declaredIn = (relFile) => {
		if (!relFile) return EMPTY;
		if (!parsedFiles.has(relFile)) {
			parsedFiles.set(relFile, declaredForFile(path.resolve(rootDir, relFile)));
		}
		return parsedFiles.get(relFile);
	};

	// Keyed by suite name so the same describe block seen under two browser
	// projects collapses into one suite. `--list` repeats every spec once per
	// configured project, and a test the UI shows twice looks like a duplicate test
	// rather than the same test in two browsers.
	const byName = new Map();

	// A spec's `tags` already include everything inherited from its describes, so
	// which of them belong to the describe is read from the source.
	const collect = (node, describeTitle, file) => {
		// One entry per (spec x configured project), so the same test title repeats
		// once per browser. Collapse on title: the UI lists tests, not browsers.
		const seenTitles = new Set();
		const specs = (node.specs ?? []).filter((spec) => {
			if (seenTitles.has(spec.title)) return false;
			seenTitles.add(spec.title);
			return true;
		});
		if (specs.length > 0) {
			const declared = declaredIn(file);
			// What the `test.describe(...)` itself declares. Read from the source
			// because --list flattens it onto every spec: inferring it instead, as the
			// tags every spec shares, cannot work for a describe holding one test,
			// whose only spec shares everything with itself. That left a one-test file
			// with no suite tag and its describe's tag shown on the test.
			const declaredSuite = (declared.suites.get(node.line) ?? []).map(withAt);
			// Falls back to the inference when the source could not answer: an
			// unparseable file, or a tag passed as a variable.
			const shared =
				declaredSuite.length > 0
					? new Set(declaredSuite)
					: specs.length > 1
						? specs
								.map((s) => new Set((s.tags ?? []).map(withAt)))
								.reduce(
									(acc, set) => (acc === null ? set : new Set([...acc].filter((t) => set.has(t)))),
									null
								)
						: new Set();
			const suiteTags = [...(shared ?? [])];

			// A test's own tags exclude the ones it inherited. Playwright reports a
			// spec's tags with everything from its describes already merged in, whereas
			// a .feature file keeps Feature-level tags separate from Scenario ones, so
			// without this subtraction the suite tag is shown twice on every row.
			const tests = specs.map((spec) => {
				const all = (spec.tags ?? []).map(withAt);
				const declaredTest = declared.tests.get(spec.line);
				const inherited = declaredTest ? declaredTest.inheritedTags.map(withAt) : null;
				const own = inherited
					? all.filter((t) => !inherited.includes(t))
					: all.filter((t) => !shared?.has(t));
				// Never subtract a test down to nothing: when every tag it carries is
				// inherited, that tag is still its id, and showing it twice beats being
				// unlinkable to a case and unrunnable by tag.
				const tags = own.length > 0 ? own : all;
				return {
					id: tags.length > 1 ? tags : (tags[0] ?? null),
					testCase: spec.title,
					type: 'spec',
					steps: declaredTest?.steps ?? []
				};
			});
			const suiteName = describeTitle || file;
			const existing = byName.get(suiteName);
			if (existing) {
				const seen = new Set(existing.tests.map((t) => t.testCase));
				for (const test of tests) {
					if (!seen.has(test.testCase)) existing.tests.push(test);
				}
			} else {
				byName.set(suiteName, {
					suiteName,
					suiteId: suiteTags.length > 1 ? suiteTags : (suiteTags[0] ?? null),
					tests
				});
			}
		}
		for (const child of node.suites ?? []) {
			collect(child, child.title, child.file ?? file);
		}
	};

	for (const fileSuite of listed.suites ?? []) {
		collect(fileSuite, null, fileSuite.title ?? fileSuite.file);
	}

	const value = {
		suites: [...byName.values()],
		// The config's own project names. Plum passes --project=<browser>, and an
		// adopted repo may name its projects anything at all, which Playwright
		// rejects outright rather than ignoring.
		// Names are kept verbatim, including the empty one a config-less run reports.
		// Filtering it out left an empty array, which buildRunCommand reads as "unknown"
		// and passes --project anyway, which is the one case that cannot accept it.
		projects: (listed.config?.projects ?? []).map((p) => p.name ?? '')
	};
	cache.set(testsRoot, { stamp, value });
	return value;
}

/** The project names the tests folder's own config declares, [] if unknown. */
async function getPlaywrightProjectNames(testsRoot) {
	const { projects } = await getPlaywrightSuites(testsRoot);
	return projects ?? [];
}

module.exports = { getPlaywrightSuites, getPlaywrightProjectNames, withAt };
