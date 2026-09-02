/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable, get } from 'svelte/store';
import { BROWSERS, TRIGGER_TYPES } from '$lib/constants';
import { SOCKET_EVENTS } from '$lib/socketEvents';
import { MANUAL_RUN_LABEL } from '$lib/copy/runners';
import { auth } from './auth';
import { getActiveProjectId, projects } from './project';

export const socket = writable(null);

// runId → run entry. One store for every run whatever its origin (manual, cron,
// REST, MCP): each is a queued job streamed over the bg-run-* events. Seeded
// optimistically by triggerRun, then kept current by the socket handlers in
// RunnerPanel.
export const backgroundRuns = writable({});

export function makeRunEntry({ projectId = null, projectName = '', kind, label, meta, status }) {
	return {
		projectId,
		projectName,
		kind,
		label,
		status, // 'queued' | 'running' | 'done'
		testCompleted: false,
		latestReportId: null,
		verdict: 'idle', // 'idle' | 'pass' | 'fail' | 'cancelled'
		output: '',
		lanes: [], // [{ id, name, testCount, status, logs }]
		currentRun: {
			tag: meta?.tag ?? '',
			workers: meta?.workers,
			browser: meta?.browser,
			runTitle: label,
			startedBy: meta?.startedBy ?? null
		},
		// { [laneId]: { [workerId]: { events: [] } } }, always keyed by laneId
		// even for a single-runner run, so the live view's Runner/Worker tabs
		// don't need a separate code path for that case.
		rrwebByLane: {}
	};
}

// Rebuilds the path down to the mutated bucket (Svelte only re-renders on a new
// reference) rather than pushing in place.
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

// crypto.randomUUID exists only in a secure context, a production install
// served over plain http:// on a bare IP doesn't get it. getRandomValues does.
function newRunId() {
	if (crypto.randomUUID) return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Enqueues a run and returns its id so the caller can navigate to /live/<id>.
// The run stays `queued` until every runner it targets is free.
export function triggerRun(id, testRunId, notify = {}, runTitle = null) {
	const s = get(socket);
	if (!s) return null;

	const { workers, testID, browser, selectedRunners } = get(runnerConfig);
	const tag = (id !== undefined ? id : testID).trim().replace(/\sOR\s/gi, (m) => m.toLowerCase());
	const runId = newRunId();
	const startedBy = get(auth).user?.name ?? null;
	const projectId = getActiveProjectId();
	const projectName = get(projects).find((p) => p.id === projectId)?.name ?? '';

	backgroundRuns.update((r) => ({
		...r,
		[runId]: makeRunEntry({
			projectId,
			projectName,
			kind: TRIGGER_TYPES.MANUAL,
			label: runTitle || tag || MANUAL_RUN_LABEL,
			meta: { tag, workers, browser, startedBy },
			status: 'queued'
		})
	}));
	panelExpanded.set(true);

	s.emit(SOCKET_EVENTS.RUN_TEST, {
		runId,
		projectId,
		tag,
		workers,
		browser,
		runners: selectedRunners,
		testRunId: testRunId ?? null,
		notifyDiscord: notify.notifyDiscord ?? false,
		notifySlack: notify.notifySlack ?? false,
		runTitle,
		startedBy
	});

	return runId;
}

export function cancelRun(id) {
	const s = get(socket);
	if (s && id) s.emit(SOCKET_EVENTS.CANCEL_TEST, { runId: id });
}

// Cron runs get a generated run id, not the task name, match one by kind + label.
export function findActiveCronRun(runs, taskName) {
	return Object.values(runs).find(
		(r) => r.kind === TRIGGER_TYPES.CRON && r.label === taskName && r.status !== 'done'
	);
}
