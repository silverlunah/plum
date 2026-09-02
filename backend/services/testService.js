/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const { featuresDir, resolveTestsRoot } = require('../lib/testsRoot');
const { frameworkFor } = require('../lib/projectPaths');
const { getPlaywrightSuites } = require('../lib/playwrightDiscovery');
const { FRAMEWORK } = require('../constants/defaults');

// Cucumber suites are parsed straight out of the .feature text. Playwright has no
// equivalent source of truth: a spec's tests only exist once the file is loaded,
// so its list comes from `playwright test --list` instead.
const getTestSuites = async (projectId) => {
	if (frameworkFor(projectId) === FRAMEWORK.PLAYWRIGHT) {
		return getPlaywrightSuites(resolveTestsRoot(projectId));
	}
	const FEATURES_DIR = featuresDir(projectId);
	const suites = [];
	let files = [];
	try {
		files = fs.readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.feature'));
	} catch {
		return { suites };
	}

	files.forEach((file) => {
		const content = fs.readFileSync(path.join(FEATURES_DIR, file), 'utf8');
		const lines = content.split('\n');

		let suiteName = '';
		let suiteTags = [];
		let backgroundSteps = [];
		const tests = [];

		let inBackground = false;
		let inExamples = false;
		let pendingTags = [];
		let currentTest = null;

		const finalizeTest = () => {
			if (currentTest) {
				tests.push(currentTest);
				currentTest = null;
			}
		};

		for (const raw of lines) {
			const trimmed = raw.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			// Tag line
			if (trimmed.startsWith('@')) {
				finalizeTest();
				inBackground = false;
				inExamples = false;
				const tags = trimmed.split(/\s+/).filter(Boolean);
				if (!suiteName) {
					suiteTags = [...suiteTags, ...tags];
				} else {
					pendingTags = [...pendingTags, ...tags];
				}
				continue;
			}

			// Feature
			if (trimmed.startsWith('Feature:')) {
				suiteName = trimmed.replace('Feature:', '').trim();
				continue;
			}

			// Background
			if (trimmed.startsWith('Background:')) {
				inBackground = true;
				inExamples = false;
				continue;
			}

			// Scenario or Scenario Outline
			const scenarioMatch = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+)/i);
			if (scenarioMatch) {
				finalizeTest();
				inBackground = false;
				inExamples = false;

				const isOutline = /^Scenario\s+Outline:/i.test(trimmed);
				const tags = pendingTags.splice(0);
				const [testId, ...extraTags] = tags;

				currentTest = {
					id: extraTags.length > 0 ? [testId, ...extraTags] : testId,
					testCase: scenarioMatch[1].trim(),
					type: isOutline ? 'outline' : 'scenario',
					steps: [...backgroundSteps],
					...(isOutline ? { examples: null } : {})
				};
				continue;
			}

			// Examples header (Scenario Outline)
			if (trimmed.startsWith('Examples:')) {
				inExamples = true;
				if (currentTest) currentTest.examples = { headers: [], rows: [] };
				continue;
			}

			// Step lines
			if (/^(Given|When|Then|And|But)\s/i.test(trimmed)) {
				if (inBackground) {
					backgroundSteps.push(trimmed);
				} else if (currentTest && !inExamples) {
					currentTest.steps.push(trimmed);
				}
				continue;
			}

			// Examples table rows
			if (inExamples && trimmed.startsWith('|') && currentTest?.examples) {
				const cells = trimmed
					.split('|')
					.filter(Boolean)
					.map((c) => c.trim());
				if (currentTest.examples.headers.length === 0) {
					currentTest.examples.headers = cells;
				} else {
					currentTest.examples.rows.push(cells);
				}
			}
		}

		finalizeTest();

		if (suiteName && tests.length) {
			suites.push({
				suiteName,
				suiteId: suiteTags.length > 1 ? suiteTags : suiteTags[0],
				tests
			});
		}
	});

	return { suites };
};

/**
 * Every test and suite id in the project, without the leading @.
 *
 * The one answer to "is this case automated", shared by the create path and the
 * periodic sync. Both used to scan .feature text themselves, which silently found
 * nothing in a Playwright project.
 */
const getTestIds = async (projectId) => {
	const ids = new Set();
	const add = (id) => {
		for (const one of Array.isArray(id) ? id : [id]) {
			if (one) ids.add(String(one).replace(/^@/, ''));
		}
	};
	for (const suite of (await getTestSuites(projectId)).suites) {
		add(suite.suiteId);
		for (const test of suite.tests) add(test.id);
	}
	return ids;
};

module.exports = { getTestSuites, getTestIds };
