/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { execFile } = require('child_process');
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
 * suite named after the file. `steps` is always empty: Playwright has no steps
 * until a test actually runs, and only if the author used test.step().
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
			// The suite's own tags are the ones every spec beneath it carries, which
			// is what a describe-level tag looks like once Playwright has pushed it
			// down onto each spec. Intersecting a single spec proves nothing (its tags
			// are all its own), so that case has no suite tag at all.
			const shared =
				specs.length > 1
					? specs
							.map((s) => new Set((s.tags ?? []).map(withAt)))
							.reduce(
								(acc, set) => (acc === null ? set : new Set([...acc].filter((t) => set.has(t)))),
								null
							)
					: new Set();
			const suiteTags = [...(shared ?? [])];

			// A test's own tags exclude the suite's. Playwright reports a spec's tags
			// with everything inherited from its describes already merged in, whereas a
			// .feature file keeps Feature-level tags separate from Scenario ones, so
			// without this subtraction the suite tag is shown twice on every row.
			const tests = specs.map((spec) => {
				const all = (spec.tags ?? []).map(withAt);
				const own = all.filter((t) => !shared?.has(t));
				// Never subtract a test down to nothing: when every tag it carries is
				// shared, that tag is still its id, and showing it twice beats being
				// unlinkable to a case and unrunnable by tag.
				const tags = own.length > 0 ? own : all;
				return {
					id: tags.length > 1 ? tags : (tags[0] ?? null),
					testCase: spec.title,
					type: 'spec',
					steps: []
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
