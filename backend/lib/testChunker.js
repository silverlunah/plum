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

const { getTestSuites } = require('../services/testService');

/**
 * Returns the primary test ID for every test that matches the given tag.
 * If tag is empty, all test IDs are returned.
 *
 * @param {string} tag  Cucumber tag expression (e.g. '@suite-login')
 * @returns {string[]}
 */
function getTestIdsForTag(tag) {
	const { suites } = getTestSuites();
	const ids = [];
	const normalTag = tag?.trim();

	// A test run selection produces a compound OR expression like "@test-1 or @test-2".
	// Split it so each part is matched individually instead of against the whole string.
	const tagParts = normalTag
		? normalTag
				.split(/\s+or\s+/i)
				.map((t) => t.trim())
				.filter(Boolean)
		: [];

	const matchesAny = (candidates) =>
		tagParts.length === 0 || tagParts.some((part) => candidates.some((id) => id === part));

	for (const suite of suites) {
		const suiteIds = Array.isArray(suite.suiteId) ? suite.suiteId : [suite.suiteId];
		const suiteMatches = !normalTag || matchesAny(suiteIds);

		for (const test of suite.tests) {
			const testIds = Array.isArray(test.id) ? test.id : [test.id];
			if (suiteMatches || matchesAny(testIds)) {
				ids.push(testIds[0]);
			}
		}
	}

	return ids;
}

/**
 * Splits test IDs into N even chunks (one per runner slot).
 * If n <= 1, returns a single chunk containing all IDs.
 *
 * @param {string[]} allIds
 * @param {number} n  Number of chunks
 * @returns {string[][]}
 */
function chunkTests(allIds, n) {
	if (n <= 1) return [allIds];
	const chunks = Array.from({ length: n }, () => []);
	allIds.forEach((id, i) => chunks[i % n].push(id));
	return chunks.filter((c) => c.length > 0);
}

/**
 * Builds a Cucumber OR tag expression from an array of test IDs.
 *
 * @param {string[]} ids
 * @returns {string}
 */
function buildTagExpression(ids) {
	if (!ids || ids.length === 0) return '';
	return ids.join(' or ');
}

module.exports = { getTestIdsForTag, chunkTests, buildTagExpression };
