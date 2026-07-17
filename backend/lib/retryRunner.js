/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const reportService = require('../services/reportService');

/**
 * Runs a suite attempt via the caller-supplied `spawnAttempt`, re-running only
 * the scenarios that failed (up to `maxRetries` extra rounds) until either
 * everything passes or retries are exhausted. Agnostic to how an attempt is
 * actually executed — the same loop drives both a local `npm run test` spawn
 * and a remote `dispatchAndPoll` call, since both reduce to
 * `(tagOverride, round) => Promise<{ code, rawJson }>`.
 *
 * @param {{
 *   maxRetries: number,
 *   spawnAttempt: (tagOverride: string|null, round: number) => Promise<{ code: number, rawJson: object[] }>,
 *   onLog: (text: string) => void
 * }} opts
 * @returns {Promise<{ code: number, rawJson: object[], attempts: Record<string, number> }>}
 */
async function runWithRetries({ maxRetries, spawnAttempt, onLog }) {
	const accumulated = [];
	const attempts = {};
	let round = 1;
	let tagOverride = null;
	let code = 0;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const result = await spawnAttempt(tagOverride, round);
		code = result.code;
		reportService.mergeRawAttempt(accumulated, result.rawJson, round, attempts);

		const failedIds = reportService.getFailedIdTags(result.rawJson);
		if (failedIds.length === 0 || round > maxRetries) break;

		onLog(
			`\n[RETRY] ${failedIds.length} test(s) failed — retrying (attempt ${round + 1}/${maxRetries + 1})\n`
		);
		tagOverride = failedIds.join(' or ');
		round++;
	}

	return { code, rawJson: accumulated, attempts };
}

module.exports = { runWithRetries };
