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

	const files = fs.readdirSync(FEATURES_DIR).filter((file) => file.endsWith('.feature'));

	files.forEach((file) => {
		const content = fs.readFileSync(path.join(FEATURES_DIR, file), 'utf8');

		let suiteName = '';
		let suiteTags = [];
		const tests = [];

		// Suites Tag Extractor
		const featureMatch = content.match(/Feature:\s*(.+)/);
		if (featureMatch) {
			suiteName = featureMatch[1].trim();
		}

		const suiteTagsMatch = content.match(/^(@[^\n]+)/m);
		if (suiteTagsMatch) {
			suiteTags = suiteTagsMatch[0].split(/\s+/).filter((tag) => tag.trim() !== ''); // Remove empty elements
		}

		// Test Cases Tag Extractor
		const scenarioMatches = [...content.matchAll(/(@[^\n]+)\s*Scenario:\s*(.+)/g)];
		scenarioMatches.forEach((match) => {
			const tags = match[1].split(/\s+/).filter((tag) => tag.trim() !== ''); // Remove empty elements
			const scenarioText = match[2].trim();

			if (tags.length === 0) return; // Skip if there are no valid tags

			const testId = tags.shift(); // Extract the first tag as testId

			tests.push({
				id: tags.length > 0 ? [testId, ...tags] : testId, // Ensure testId is correctly structured
				testCase: scenarioText
			});
		});

		if (suiteName && tests.length) {
			suites.push({ suiteName, suiteId: suiteTags.length > 1 ? suiteTags : suiteTags[0], tests });
		}
	});

	return { suites };
};

module.exports = { getTestSuites };
