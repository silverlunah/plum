/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Socket.io event names shared with the backend. There is no shared package
// between the two (Node/CommonJS backend, SvelteKit/ESM frontend), so this
// mirrors backend/constants/socketEvents.js by hand, keep both in sync when
// adding or renaming an event.
export const SOCKET_EVENTS = Object.freeze({
	// Client → server: request a run / cancel a run by id
	RUN_TEST: 'run-test',
	CANCEL_TEST: 'cancel-test',

	// Server → every client: one run's lifecycle, keyed by runId
	BG_RUN_QUEUED: 'bg-run-queued',
	BG_RUN_START: 'bg-run-start',
	BG_RUN_LOG: 'bg-run-log',
	BG_RUN_DONE: 'bg-run-done',
	BG_RUN_LANES_INIT: 'bg-run-lanes-init',
	BG_RUN_LANE_LOG: 'bg-run-lane-log',
	BG_RUN_LANE_STATUS: 'bg-run-lane-status',
	BG_RUN_LANE_RRWEB_BATCH: 'bg-run-lane-rrweb-batch',

	// Global notifications (any client, not tied to a specific run)
	REPORT_READY: 'report-ready',

	// Collaborative test-run execution, join a run's room, get changes live
	TEST_RUN_JOIN: 'test-run-join',
	TEST_RUN_LEAVE: 'test-run-leave',
	TEST_RUN_CHANGED: 'test-run-changed',

	// Client → server: join the active project's room (scopes bg-run streams)
	JOIN_PROJECT: 'join-project'
});
