/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { randomUUID } = require('crypto');
const runQueueService = require('../services/runQueueService');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { SOCKET_EVENTS } = require('../constants/socketEvents');

// The socket layer only relays run requests to the queue and back — every run,
// manual included, is a queued job streamed over the bg-run-* events. The
// client generates the run id so it can navigate to /live/<id> immediately.
const socketHandler = (io) => {
	io.on('connection', (socket) => {
		socket.on(SOCKET_EVENTS.RUN_TEST, async (payload = {}) => {
			const tag = payload.tag ?? '';
			const runTitle = payload.runTitle ?? null;
			const runners =
				Array.isArray(payload.runners) && payload.runners.length > 0
					? payload.runners
					: [BUILT_IN_RUNNER_ID];
			try {
				await runQueueService.enqueue({
					id: payload.runId || randomUUID(),
					projectId: Number(payload.projectId) || undefined,
					kind: TRIGGER_TYPE.MANUAL,
					triggerType: TRIGGER_TYPE.MANUAL,
					label: runTitle || tag || 'Manual run',
					tag,
					workers: Number(payload.workers) > 1 ? Number(payload.workers) : 1,
					browser: payload.browser ?? DEFAULT_BROWSER,
					runnerIds: runners,
					testRunId: payload.testRunId ?? null,
					runTitle,
					startedBy: payload.startedBy ?? null,
					notifyDiscord: payload.notifyDiscord === true,
					notifySlack: payload.notifySlack === true
				});
			} catch (e) {
				console.error('[socket] enqueue failed:', e.message);
			}
		});

		socket.on(SOCKET_EVENTS.CANCEL_TEST, async (payload) => {
			const id = typeof payload === 'string' ? payload : payload?.runId;
			if (id) await runQueueService.cancel(id).catch(() => {});
		});
	});
};

module.exports = socketHandler;
