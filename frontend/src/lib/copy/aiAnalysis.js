/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { ANALYSIS_VERDICT } from '$lib/constants';

export const CARD_TITLE = 'AI Analysis';
export const CARD_IDLE_HINT = 'Ask the AI why this run failed';

export const START_MODAL_TITLE = 'Analyze this report?';
export const START_MODAL_BODY =
	'The AI reads this project’s test code and each failure’s recent history, then tells you whether this is a real issue, a flake, or a bug in the test itself. It changes nothing without asking you first.';
export const START_CONFIRM_LABEL = 'Analyze';

export const ANALYZING_LABEL = 'Investigating the failures';
export const ANALYZING_HINT =
	'Reading the test code and each failure’s history. This usually takes a minute or two, and longer if it re-runs a test.';

export const FIXING_LABEL = 'Writing a fix';
export const FIXING_HINT = 'Working in an isolated clone, then opening a pull request.';

export const VERDICT_LABEL = {
	[ANALYSIS_VERDICT.TEST_CODE]: 'Test code issue',
	[ANALYSIS_VERDICT.PRODUCT_BUG]: 'Real issue',
	[ANALYSIS_VERDICT.FLAKE]: 'Flake',
	[ANALYSIS_VERDICT.UNKNOWN]: 'Inconclusive'
};

export const VERDICT_HEADLINE = {
	[ANALYSIS_VERDICT.TEST_CODE]:
		'The fault is in the E2E test, not the app. The AI can open a pull request with a fix.',
	[ANALYSIS_VERDICT.PRODUCT_BUG]:
		'This is a real issue in the application under test, not a flaky test.',
	[ANALYSIS_VERDICT.FLAKE]: 'This looks like a flake. The test and the app both check out.',
	[ANALYSIS_VERDICT.UNKNOWN]:
		'Not enough evidence to call it. Re-analyze for a different angle, or dig in by hand.'
};

export const BADGE_VARIANT = {
	[ANALYSIS_VERDICT.TEST_CODE]: 'ai',
	[ANALYSIS_VERDICT.PRODUCT_BUG]: 'fail',
	[ANALYSIS_VERDICT.FLAKE]: 'flaky',
	[ANALYSIS_VERDICT.UNKNOWN]: 'neutral'
};

export const FINDINGS_LABEL = 'What it found';
export const RECOMMENDATION_LABEL = 'Recommended next step';
export const EVIDENCE_LABEL = 'Evidence';

export const FIX_LABEL = 'Fix it and open a PR';
export const FIX_MODAL_TITLE = 'Let the AI fix this?';
export const FIX_MODAL_BODY =
	'The AI clones this project’s repo, edits the test on its own branch and opens a pull request. It can never push to the default branch or merge, so nothing lands until you review it.';
export const FIX_CONFIRM_LABEL = 'Open a pull request';
export const VIEW_PR_LABEL = 'View pull request';

export const REANALYZE_LABEL = 'Re-analyze';
export const REANALYZE_TITLE = 'Start over and look at this from a different angle';

export const ANALYSIS_FAILED = 'The AI analysis failed.';

export const attemptLabel = (attempt) => `Attempt ${attempt}`;
export const analyzedByLabel = (name, at) =>
	`${name || 'Someone'} · ${new Date(at).toLocaleString()}`;
