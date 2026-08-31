/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { pluralize } from './common';

export const REPORTS_BACK_LABEL = 'Reports';
export const PASSED_LABEL = 'Passed';
export const FAILED_LABEL = 'Failed';

// ── Reports list ──
export const LIST_PAGE_TITLE = 'Reports — Plum';
export const HEADING = 'Reports';
export const PASSING_LABEL = 'passing';
export const RECENT_LABEL = 'Recent';
export const TREND_HINT = '← older · newer →';
export const NO_REPORTS_MESSAGE = 'No reports yet. Run a test to generate one.';
export const SELECT_ALL_TITLE = 'Select all on this page';
export const SELECT_ROW_TITLE = 'Select';
export const DELETE_REPORT_TITLE = 'Delete report';

export const deleteReportsTitle = (count) =>
	count === 1 ? 'Delete report?' : `Delete ${count} reports?`;
export const deleteReportsBody = (count) =>
	count === 1
		? 'This will permanently remove the report and its data file.'
		: `This will permanently remove ${count} reports and their data files.`;
export const runsRecorded = (count) => `${count} ${pluralize(count, 'run')} recorded`;
export const passedCountLabel = (count) => `${count} passed`;
export const failedCountLabel = (count) => `${count} failed`;
export const trendDotTitle = (status, tags, date) => `${status} · ${tags} · ${date}`;
export const deleteSelectedLabel = (count) => `Delete (${count})`;

// ── Report detail ──
export const DETAIL_PAGE_TITLE = 'Report — Plum';
export const LOAD_ERROR = 'Could not load report.';
export const STAT_PASSED = 'passed';
export const STAT_FAILED = 'failed';
export const STAT_SKIPPED = 'skipped';
export const STAT_DURATION = 'duration';
export const RUN_LOGS_LABEL = 'Run Logs';
export const RETRY_TITLE = 'Failed and was automatically retried before the final result';
export const WATCH_REPLAY_TITLE = 'Watch replay';
export const REPLAY_LABEL = 'Replay';

export const runnersBadge = (count) => `${count} runners`;
export const casesCountLabel = (count) => `${count} cases`;
export const attemptsLabel = (count) => `${count} attempts`;
export const caseLabel = (index) => `Case ${index}`;

// ── Recording replay ──
export const PLAYER_LOAD_ERROR = 'Could not load this recording.';
export const INSPECT_TOGGLE_LABEL = 'Inspect element';
export const REPLAY_EMPTY_FRAME_HINT = 'No page rendered at this point in the recording';

export const REPORT_EXPORT_MENU_ITEMS = [
	{ id: 'csv', label: 'CSV', hint: 'Download report' },
	{ id: 'json', label: 'JSON', hint: 'Structured summary' }
];

export const DISMISS_LABEL = 'Dismiss';
export const RESTART_LABEL = 'Restart replay';
export const STEPS_RAIL_HEADING = 'Steps';
export const INSPECTOR_HEADING = 'Inspector';
export const CLOSE_INSPECTOR_LABEL = 'Close';
export const NO_ELEMENT_SELECTED = 'Click an element in the replay to inspect it.';
export const ELEMENT_ATTRIBUTES_LABEL = 'Attributes';
export const ELEMENT_SIZE_LABEL = 'Size';
export const INSPECTOR_TAB_ELEMENT = 'Element';
export const INSPECTOR_TAB_DOM = 'DOM';
export const DOM_TREE_EMPTY = 'Click an element in the replay to locate it in the DOM.';
export const ELEMENT_LOCATORS_LABEL = 'Locators';
export const LOCATOR_RECOMMENDED_LABEL = 'recommended';
export const LOCATOR_NOT_UNIQUE_LABEL = 'matches multiple';
export const COPY_LOCATOR_TITLE = 'Copy';
export const LOCATOR_COPIED_TITLE = 'Copied';
export const INSPECTOR_SEARCH_PLACEHOLDER = 'Search text, CSS selector or XPath…';
export const inspectorSearchCount = (kind, n) => {
	const what = { css: 'CSS', xpath: 'XPath', keyword: 'text' }[kind] ?? '';
	if (n === 0) return `No ${what} matches`.replace('  ', ' ');
	return `${n} ${what} ${n === 1 ? 'match' : 'matches'}`.replace('  ', ' ');
};
export const INSPECTOR_SEARCH_INVALID = 'Invalid selector';
export const recordingTabLabel = (tabIndex) =>
	tabIndex === 0 ? 'Main tab' : `Tab/Window ${tabIndex + 1}`;

// ── Live run ──
export const LIVE_PAGE_TITLE = 'Live Run — Plum';
export const NO_TESTS_RUNNING_HEADING = 'No tests currently running';
export const NO_TESTS_RUNNING_BODY =
	'Start a test from the panel below, then come back here to watch it live.';
export const VIEW_PAST_REPORTS_LINK = 'View past reports →';
export const SELECT_RUN_HINT =
	'Select a run above, or wait — the report opens automatically when it finishes.';
export const LIVE_BADGE_LABEL = 'Live';
export const CANCEL_RUN_LABEL = 'Cancel run';
export const ALL_TESTS_PASSED = 'All tests passed';
export const SOME_TESTS_FAILED = 'Some tests failed';
export const VIEW_REPORT_NOW_LABEL = 'View Report Now';
export const AWAITING_STREAM_LABEL = 'Awaiting stream...';
export const NO_STREAM_LABEL = 'No stream...';
export const RUNNER_LABEL = 'Runner';
export const RUNNING_LABEL = 'Running…';
export const FINISHED_LABEL = 'Finished';
export const WAITING_FOR_OUTPUT = '(waiting for output…)';

export const UNKNOWN_RUNNER_LABEL = 'Unknown runner';
export const workerLabel = (id) => `Worker ${id}`;

export const runsInProgressHeading = (count) =>
	count === 1 ? 'A run in progress' : `${count} runs in progress`;
export const workersCountLabel = (count) => `${count} ${pluralize(count, 'worker')}`;
export const redirectingIn = (seconds) => `Redirecting in ${seconds}s…`;

// ── Queued / not-found run ──
export const QUEUED_HEADING = 'Waiting for a runner';
export const QUEUED_BODY = 'This run starts as soon as every runner it needs is free.';
export const RUN_NOT_FOUND_HEADING = 'Run not found';
export const RUN_NOT_FOUND_BODY =
	'This run has finished or was never started. Check the reports list for its results.';
export const RUN_SKIPPED_HEADING = 'Run skipped';
export const RUN_FORBIDDEN_HEADING = 'Another project’s run';
export const RUN_FORBIDDEN_BODY =
	'This run belongs to a different project. Switch to that project to watch it — or ask an admin for access if you’re not a member.';
export const queuePositionLine = (n) => (n > 0 ? `Position ${n} in the queue` : 'Next up');
