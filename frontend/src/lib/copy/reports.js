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
export const SCREENSHOT_TOGGLE_LABEL = 'Screenshot';
export const STEP_SCREENSHOT_ALT = 'Step screenshot';
export const NO_SCREENSHOT_MESSAGE = 'No screenshot captured for this step';

export const runnersBadge = (count) => `${count} runners`;
export const casesCountLabel = (count) => `${count} cases`;
export const attemptsLabel = (count) => `${count} attempts`;
export const caseLabel = (index) => `Case ${index}`;
export const replayScreenshotAlt = (index) => `Step ${index} screenshot`;
export const pauseOrPlayTitle = (playing) => (playing ? 'Pause' : 'Play');
export const replayCounter = (index, total) => `${index} / ${total}`;

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
export const LIVE_STEP_LABEL = 'Step';
export const LIVE_BROWSER_VIEW_ALT = 'Live browser view';
export const AWAITING_STREAM_LABEL = 'Awaiting stream...';
export const NO_STREAM_LABEL = 'No stream...';
export const RUNNER_LABEL = 'Runner';
export const RUNNING_LABEL = 'Running…';
export const FINISHED_LABEL = 'Finished';
export const WAITING_FOR_OUTPUT = '(waiting for output…)';

export const runsInProgressHeading = (count) =>
	count === 1 ? 'A run in progress' : `${count} runs in progress`;
export const workersCountLabel = (count) => `${count} ${pluralize(count, 'worker')}`;
export const redirectingIn = (seconds) => `Redirecting in ${seconds}s…`;
