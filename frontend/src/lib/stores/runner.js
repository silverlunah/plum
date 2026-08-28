/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable, get } from 'svelte/store';
import { BROWSERS } from '$lib/constants';
import { SOCKET_EVENTS } from '$lib/socketEvents';
import { auth } from './auth';

export const socket = writable(null);

export const runnerState = writable({
	output: '',
	running: false,
	testCompleted: false,
	latestReportId: null, // number | null — set after test finishes
	status: 'idle', // 'idle' | 'running' | 'pass' | 'fail'
	lastRunId: '',
	lanes: [], // [{ id, name, testCount, status, logs }] multi-runner only
	currentRun: null, // { tag, workers, browser, runners } — set while running
	// { [laneId]: { [workerId]: { events: [] } } } — always keyed by laneId even
	// for a plain single-runner run (BUILT_IN_RUNNER_ID), so the live view's
	// Runner/Worker tabs don't need a separate code path for that case.
	rrwebByLane: {}
});

// Merges a batch of rrweb events into the right lane/worker bucket, creating
// it on first sight — Svelte only re-renders on a *new* object/array
// reference, so this rebuilds the path down to the mutated bucket rather than
// pushing in place. Shared by runnerState (interactive) and backgroundRuns.
export function mergeRRwebBatch(rrwebByLane, { id: laneId, workerId, events }) {
	const lane = rrwebByLane[laneId] ?? {};
	const worker = lane[workerId] ?? { events: [] };
	return {
		...rrwebByLane,
		[laneId]: {
			...lane,
			[workerId]: { events: [...worker.events, ...events] }
		}
	};
}

export function appendRRwebBatch(batch) {
	runnerState.update((s) => ({ ...s, rrwebByLane: mergeRRwebBatch(s.rrwebByLane, batch) }));
}

export const runnerConfig = writable({
	workers: 1,
	testID: '',
	browser: BROWSERS[0].id,
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
		rrwebByLane: {}
	});
	panelExpanded.set(true);

	s.emit(SOCKET_EVENTS.RUN_TEST, {
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
	if (s) s.emit(SOCKET_EVENTS.CANCEL_TEST);
}
