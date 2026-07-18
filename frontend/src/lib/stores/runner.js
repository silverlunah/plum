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

import { writable, get } from 'svelte/store';
import { auth } from './auth';

export const socket = writable(null);

export const runnerState = writable({
	output: '',
	running: false,
	testCompleted: false,
	latestReportId: null, // number | null — set after test finishes
	status: 'idle', // 'idle' | 'running' | 'pass' | 'fail'
	lastRunId: '',
	lanes: [], // [{ id, name, testCount, status, logs, latestScreenshot }] multi-runner only
	currentRun: null, // { tag, workers, browser, runners } — set while running
	latestScreenshot: null // { stepName, data: base64 } for single built-in runner
});

export const runnerConfig = writable({
	workers: 1,
	testID: '',
	browser: 'chromium',
	selectedRunners: ['built-in']
});

export const panelExpanded = writable(false);

export const builtInEnabled = writable(true);

export const reportsVersion = writable(0);
export const runsVersion = writable(0);

// Map of runId → runnerState-shaped object (plus kind/label) for every
// non-manual run currently executing (scheduled cron jobs, REST/MCP-triggered
// runs) — these are spawned server-side with no single browser socket to
// stream to, so they're tracked separately from `runnerState`.
export const backgroundRuns = writable({});

export function triggerRun(id, testRunId, notify = {}, runTitle = null) {
	const s = get(socket);
	if (!s) return;

	const { workers, testID, browser, selectedRunners } = get(runnerConfig);
	const runId = (id !== undefined ? id : testID).trim().replace(/\sOR\s/gi, (m) => m.toLowerCase());

	runnerState.set({
		output: `Running: ${runId || '(all tests)'}\n`,
		running: true,
		testCompleted: false,
		latestReportId: null,
		status: 'running',
		lastRunId: runId,
		lanes: [],
		currentRun: { tag: runId, workers, browser, runners: selectedRunners, runTitle },
		latestScreenshot: null
	});
	panelExpanded.set(true);

	s.emit('run-test', {
		tag: runId,
		workers,
		browser,
		runners: selectedRunners,
		testRunId: testRunId ?? null,
		notifyDiscord: notify.notifyDiscord ?? false,
		notifySlack: notify.notifySlack ?? false,
		runTitle,
		startedBy: get(auth).user?.name ?? null
	});
}

export function cancelRun() {
	const s = get(socket);
	if (s) s.emit('cancel-test');
}
