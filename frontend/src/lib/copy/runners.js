/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { BUILTIN_RUNNER_ID } from '$lib/constants';
import { BUILTIN_RUNNER_LABEL } from './common';
import { triggerLabel } from '$lib/utils/format';

export const RUN_ALL_TITLE = 'Run all tests?';
export const RUN_ALL_CONFIRM_LABEL = 'Run all tests';
export const RUN_ALL_BODY_PREFIX = 'No tag or filter is set. This will run';
export const RUN_ALL_BODY_STRONG = 'every test';
export const RUN_ALL_BODY_SUFFIX = 'in the suite, which may take a while.';

export const VIEW_REPORT_LABEL = 'View Report';
export const TEST_RUN_LABEL = 'Test Run';
export const CLEAR_TEST_RUN_LABEL = 'Clear test run';
export const NO_RUN_SELECTED_LABEL = 'None';
export const NO_ACTIVE_TEST_RUNS = 'No active test runs';
export const WORKERS_LABEL = 'Workers';
export const BROWSER_LABEL = 'Browser';
export const RUNNERS_LABEL = 'Runners';
export const NOTIFY_LABEL = 'Notify';
export const NO_AUTOMATED_CASES_TITLE = 'No automated cases in this run';
export const RUNNING_LABEL = 'Running';
export const RUN_LABEL = 'Run';
export const MANUAL_RUN_LABEL = 'Manual run';
export const NO_TESTS_RUNNING = 'No tests currently running';
export const LIVE_LABEL = 'Live';

export const automatedCaseCount = (count) => `${count} automated`;
export const discordNotifyTitle = (active) =>
	active ? 'Discord notification on' : 'Discord notification off';
export const slackNotifyTitle = (active) =>
	active ? 'Slack notification on' : 'Slack notification off';
export const runnersCountLabel = (count) => `${count} runners`;
export const runKindLabel = (kind) => `${triggerLabel(kind)} run`;
export const startedByLabel = (name) => `started by ${name}`;
export const collapseOrExpandLabel = (expanded) => (expanded ? 'Collapse panel' : 'Expand panel');

export function statusLabel(state, anyBgRunning, anyBgCronRunning) {
	if (state.running) return 'Running';
	if (state.status === 'pass') return 'Passed';
	if (state.status === 'fail') return 'Failed';
	if (anyBgCronRunning) return 'Scheduled';
	if (anyBgRunning) return 'Running';
	return 'Ready';
}

export function runnerSummary(cfg, availableRunners) {
	if (cfg.selectedRunners.length === 1 && cfg.selectedRunners[0] === BUILTIN_RUNNER_ID) {
		return BUILTIN_RUNNER_LABEL;
	}
	if (cfg.selectedRunners.length === 1) {
		return availableRunners.find((r) => r.id === cfg.selectedRunners[0])?.name ?? '1 node';
	}
	return `${cfg.selectedRunners.length} nodes`;
}
