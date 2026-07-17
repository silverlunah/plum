/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Socket.io event names shared with the backend. There is no shared package
// between the two (Node/CommonJS backend, SvelteKit/ESM frontend), so this
// mirrors backend/constants/socketEvents.js by hand — keep both in sync when
// adding or renaming an event.
export const SOCKET_EVENTS = Object.freeze({
	// Interactive single-run (built-in runner, one browser tab watching)
	RUN_TEST: 'run-test',
	CANCEL_TEST: 'cancel-test',
	LOG: 'log',
	DONE: 'done',
	STEP_SCREENSHOT: 'step-screenshot',

	// Multi-lane distributed run (single interactive run, several runners)
	RUNNER_LANES_INIT: 'runner-lanes-init',
	RUNNER_LANE_LOG: 'runner-lane-log',
	RUNNER_LANE_STATUS: 'runner-lane-status',
	RUNNER_LANE_SCREENSHOT: 'runner-lane-screenshot',

	// Background runs (cron / REST / MCP triggered, no single owning socket)
	BG_RUN_START: 'bg-run-start',
	BG_RUN_LOG: 'bg-run-log',
	BG_RUN_DONE: 'bg-run-done',
	BG_RUN_SCREENSHOT: 'bg-run-screenshot',
	BG_RUN_LANES_INIT: 'bg-run-lanes-init',
	BG_RUN_LANE_LOG: 'bg-run-lane-log',
	BG_RUN_LANE_STATUS: 'bg-run-lane-status',
	BG_RUN_LANE_SCREENSHOT: 'bg-run-lane-screenshot',

	// Global notifications (any client, not tied to a specific run)
	TESTS_CHANGED: 'tests-changed',
	REPORT_READY: 'report-ready'
});
