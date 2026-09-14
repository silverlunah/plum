/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Report analysis is Plum's only AI capability: investigate a failed report,
// then optionally fix the test and open a PR. Mirrored in frontend constants.js.
const AI_PROVIDER = Object.freeze({ ANTHROPIC: 'anthropic', OPENAI: 'openai' });

// Used when the operator connected a key but left the model field blank.
const DEFAULT_AI_MODEL = Object.freeze({
	[AI_PROVIDER.ANTHROPIC]: 'claude-sonnet-5',
	[AI_PROVIDER.OPENAI]: 'gpt-5'
});

const ANALYSIS_STATUS = Object.freeze({
	ANALYZING: 'analyzing',
	DONE: 'done',
	FIXING: 'fixing',
	FIXED: 'fixed',
	ERROR: 'error'
});

// Only TEST_CODE unlocks the fix-and-open-a-PR step.
const ANALYSIS_VERDICT = Object.freeze({
	TEST_CODE: 'test-code',
	PRODUCT_BUG: 'product-bug',
	FLAKE: 'flake',
	UNKNOWN: 'unknown'
});

const isVerdict = (v) => Object.values(ANALYSIS_VERDICT).includes(v);

module.exports = {
	AI_PROVIDER,
	DEFAULT_AI_MODEL,
	ANALYSIS_STATUS,
	ANALYSIS_VERDICT,
	isVerdict
};
