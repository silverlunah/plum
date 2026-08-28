/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Socket.io event names shared between the backend and the frontend. There is
 * no shared package between the two (CommonJS backend, ESM/Svelte frontend),
 * so `frontend/src/lib/socketEvents.js` mirrors this file by hand — keep both
 * in sync when adding or renaming an event.
 */
const SOCKET_EVENTS = Object.freeze({
	// Interactive single-run (built-in runner, one browser tab watching)
	RUN_TEST: 'run-test',
	CANCEL_TEST: 'cancel-test',
	LOG: 'log',
	DONE: 'done',

	// Multi-lane distributed run (single interactive run, several runners)
	RUNNER_LANES_INIT: 'runner-lanes-init',
	RUNNER_LANE_LOG: 'runner-lane-log',
	RUNNER_LANE_STATUS: 'runner-lane-status',

	// Background runs (cron / REST / MCP triggered, no single owning socket)
	BG_RUN_START: 'bg-run-start',
	BG_RUN_LOG: 'bg-run-log',
	BG_RUN_DONE: 'bg-run-done',
	BG_RUN_LANES_INIT: 'bg-run-lanes-init',
	BG_RUN_LANE_LOG: 'bg-run-lane-log',
	BG_RUN_LANE_STATUS: 'bg-run-lane-status',

	// Live rrweb streaming (Phase 3) — one shape for every run type, always
	// carrying a lane id (BUILT_IN_RUNNER_ID for the plain single-run case) and
	// a workerId, so a single built-in run with --parallel workers is finally
	// attributable per worker instead of one flat interleaved stream.
	RUNNER_LANE_RRWEB_BATCH: 'runner-lane-rrweb-batch',
	BG_RUN_LANE_RRWEB_BATCH: 'bg-run-lane-rrweb-batch',

	// Global notifications (any client, not tied to a specific run)
	REPORT_READY: 'report-ready'
});

module.exports = { SOCKET_EVENTS };
