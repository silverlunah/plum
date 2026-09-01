/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { withAt } = require('./playwrightDiscovery');

/**
 * Converts Playwright's JSON report into the feature/scenario/step shape Plum
 * already stores and renders.
 *
 * Adapting at the boundary rather than adding a second pipeline means the retry
 * merge, the tag auto-sync, the report page and the exporters all keep working
 * untouched. The cost is that Playwright concepts have to be named in Cucumber
 * terms: a spec file becomes a feature and a test becomes a scenario.
 *
 * Returns { features, attempts } where `attempts` maps a scenario's test-id tag to
 * how many times Playwright ran it — read from `results[]`, which is why Playwright
 * retries natively while Cucumber needs Plum's own loop.
 */
function toFeatures(pwJson) {
	const byFile = new Map();
	const attempts = {};

	const walk = (node, file, titlePath) => {
		const currentFile = node.file ?? file;

		const seen = new Set();
		for (const spec of node.specs ?? []) {
			// --list/report emit one spec per configured project; a run is pinned to a
			// single --project, but guard anyway so a scenario is never doubled.
			if (seen.has(spec.title)) continue;
			seen.add(spec.title);

			const tags = (spec.tags ?? []).map(withAt);
			// Playwright groups every project's attempts under one spec. A run uses one
			// project, so the first test entry is the only one.
			const test = (spec.tests ?? [])[0];
			const results = test?.results ?? [];
			const last = results[results.length - 1];

			const steps = buildSteps(last, spec.title);
			const idTag = tags.find((t) => /^@tc-?\d+/i.test(t) || /^@test[\w-]*/i.test(t));
			if (idTag && results.length > 0) attempts[idTag] = results.length;

			const featureName = titlePath[0] ?? currentFile;
			if (!byFile.has(featureName)) {
				byFile.set(featureName, {
					id: featureName,
					uri: currentFile,
					name: featureName,
					keyword: 'Feature',
					elements: []
				});
			}
			byFile.get(featureName).elements.push({
				id: `${currentFile};${spec.title}`.toLowerCase(),
				name: spec.title,
				keyword: 'Scenario',
				type: 'scenario',
				line: spec.line ?? 0,
				tags: tags.map((name) => ({ name })),
				steps
			});
		}

		for (const child of node.suites ?? []) {
			walk(child, currentFile, [...titlePath, child.title]);
		}
	};

	for (const fileSuite of pwJson.suites ?? []) {
		// The file-level suite's title is the spec path; a describe inside it becomes
		// the feature name, matching how a .feature file's Feature line does.
		walk(fileSuite, fileSuite.file ?? fileSuite.title, []);
	}

	return { features: [...byFile.values()], attempts };
}

// Playwright statuses are per-result: passed | failed | timedOut | skipped |
// interrupted. Everything that is not a pass or an explicit skip is a failure, so
// a timeout does not read as green.
function stepStatus(status) {
	if (status === 'passed') return 'passed';
	if (status === 'skipped') return 'skipped';
	return 'failed';
}

/**
 * test.step() calls become steps. A test without them has no step breakdown at
 * all, so it becomes a single step carrying the test's own outcome and error —
 * otherwise the report would show a scenario with nothing in it.
 *
 * `keyword` is deliberately empty: Given/When/Then is Gherkin vocabulary and a
 * Playwright step has no equivalent. The report hides the chip when it is blank.
 */
function buildSteps(result, title) {
	if (!result) {
		return [
			{
				keyword: '',
				name: title,
				result: { status: 'failed', duration: 0, error_message: 'Test did not report a result' }
			}
		];
	}

	const errorMessage = (result.errors ?? []).map((e) => e.message).join('\n\n') || null;
	const authored = (result.steps ?? []).filter(
		(s) => s.category === undefined || s.category === 'test.step'
	);

	if (authored.length === 0) {
		return [
			{
				keyword: '',
				name: title,
				result: {
					status: stepStatus(result.status),
					duration: (result.duration ?? 0) * 1_000_000,
					...(errorMessage && { error_message: errorMessage })
				}
			}
		];
	}

	return authored.map((step, i) => {
		const failed = Boolean(step.error);
		const isLast = i === authored.length - 1;
		return {
			keyword: '',
			name: step.title,
			result: {
				status: failed
					? 'failed'
					: stepStatus(result.status === 'failed' && !isLast ? 'passed' : result.status),
				duration: (step.duration ?? 0) * 1_000_000,
				...((step.error?.message || (isLast && errorMessage)) && {
					error_message: step.error?.message ?? errorMessage
				})
			}
		};
	});
}

module.exports = { toFeatures };
