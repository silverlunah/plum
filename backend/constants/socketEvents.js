/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Socket.io event names shared between the backend and the frontend. There is
 * no shared package between the two (CommonJS backend, ESM/Svelte frontend),
 * so `frontend/src/lib/socketEvents.js` mirrors this file by hand, keep both
 * in sync when adding or renaming an event.
 */
const SOCKET_EVENTS = Object.freeze({
	// Client → server: request a run / cancel a run by id
	RUN_TEST: 'run-test',
	CANCEL_TEST: 'cancel-test',

	// Server → every client: one run's lifecycle, keyed by runId. Every run
	// (manual, cron, REST, MCP) flows through the queue and streams over these,
	// there is no separate "interactive" socket path.
	BG_RUN_QUEUED: 'bg-run-queued',
	BG_RUN_START: 'bg-run-start',
	BG_RUN_LOG: 'bg-run-log',
	BG_RUN_DONE: 'bg-run-done',
	BG_RUN_LANES_INIT: 'bg-run-lanes-init',
	BG_RUN_LANE_LOG: 'bg-run-lane-log',
	BG_RUN_LANE_STATUS: 'bg-run-lane-status',

	// Live rrweb streaming: always carries a lane id (BUILT_IN_RUNNER_ID for the
	// plain single-runner case) and a workerId, so a run with --parallel workers
	// is attributable per worker instead of one flat interleaved stream.
	BG_RUN_LANE_RRWEB_BATCH: 'bg-run-lane-rrweb-batch',

	// Global notifications (any client, not tied to a specific run)
	REPORT_READY: 'report-ready',

	// Collaborative test-run execution: clients on one run's page join its room
	// and get every assignment / result / structural change live.
	TEST_RUN_JOIN: 'test-run-join',
	TEST_RUN_LEAVE: 'test-run-leave',
	TEST_RUN_CHANGED: 'test-run-changed',

	// Client → its active project's room; run streams are emitted only there.
	JOIN_PROJECT: 'join-project'
});

module.exports = { SOCKET_EVENTS };
