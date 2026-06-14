/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

const fs = require('fs');
const path = require('path');

const FEATURES_DIR = path.join(__dirname, '../tests/features');

const getTestSuites = () => {
	const suites = [];
	const files = fs.readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.feature'));

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
					...(isOutline ? { examples: null } : {}),
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
				tests,
			});
		}
	});

	return { suites };
};

module.exports = { getTestSuites };
