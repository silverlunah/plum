/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// `--list` loads every spec file, which costs about a second. The repository page,
// the run bar and the chunker all ask for the same list, so it is cached per tests
// folder and invalidated by the newest mtime under it.
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

function listSpecs(testsRoot) {
	const raw = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
		cwd: testsRoot,
		encoding: 'utf8',
		shell: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, PLUM_REPORT_FILE: '' }
	});
	return JSON.parse(raw);
}

/**
 * Playwright's spec list in the shape the repository UI and the chunker already
 * consume: { suites: [{ suiteName, suiteId, tests: [{ id, testCase, type, steps }] }] }.
 *
 * A describe block becomes a suite and its tag becomes the suite id, which mirrors
 * how a .feature file's Feature-level tag does. A file with no describe becomes one
 * suite named after the file. `steps` is always empty: Playwright has no steps
 * until a test actually runs, and only if the author used test.step().
 */
function getPlaywrightSuites(testsRoot) {
	if (!fs.existsSync(testsRoot)) return { suites: [] };

	const stamp = newestMtime(testsRoot);
	const hit = cache.get(testsRoot);
	if (hit && hit.stamp === stamp) return hit.value;

	let listed;
	try {
		listed = listSpecs(testsRoot);
	} catch (e) {
		// A spec that does not compile, or a missing config — surfaced as an empty
		// list rather than a 500, the same way an unreadable feature file is.
		console.error(`[discovery] playwright --list failed in ${testsRoot}: ${e.message}`);
		return { suites: [] };
	}

	// Keyed by suite name so the same describe block seen under two browser
	// projects collapses into one suite. `--list` repeats every spec once per
	// configured project, and a test the UI shows twice looks like a duplicate test
	// rather than the same test in two browsers.
	const byName = new Map();

	// A spec's `tags` already include everything inherited from its describes, so a
	// suite's own tags are whatever every spec beneath it shares.
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
			const tests = specs.map((spec) => {
				const tags = (spec.tags ?? []).map(withAt);
				return {
					id: tags.length > 1 ? tags : (tags[0] ?? null),
					testCase: spec.title,
					type: 'spec',
					steps: []
				};
			});
			const shared = specs
				.map((s) => new Set((s.tags ?? []).map(withAt)))
				.reduce(
					(acc, set) => (acc === null ? set : new Set([...acc].filter((t) => set.has(t)))),
					null
				);
			const suiteTags = [...(shared ?? [])];
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

	const value = { suites: [...byName.values()] };
	cache.set(testsRoot, { stamp, value });
	return value;
}

module.exports = { getPlaywrightSuites, withAt };
