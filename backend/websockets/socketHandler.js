/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { randomUUID } = require('crypto');
const prisma = require('../services/prisma');
const runQueueService = require('../services/runQueueService');
const { accessibleProjectIds } = require('../lib/projectContext');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { SOCKET_EVENTS } = require('../constants/socketEvents');

// The socket is authenticated (io.use); these checks add per-project authz.
async function canReachProject(socket, projectId) {
	if (!projectId) return false;
	const ids = await accessibleProjectIds({
		userId: socket.data.user?.userId,
		role: socket.data.user?.role
	});
	return ids.includes(Number(projectId));
}

const socketHandler = (io) => {
	io.on('connection', (socket) => {
		socket.on(SOCKET_EVENTS.JOIN_PROJECT, async ({ projectId } = {}) => {
			for (const room of socket.rooms) {
				if (room.startsWith('project:')) socket.leave(room);
			}
			if (await canReachProject(socket, projectId)) socket.join(`project:${Number(projectId)}`);
		});

		socket.on(SOCKET_EVENTS.RUN_TEST, async (payload = {}) => {
			const projectId = Number(payload.projectId) || undefined;
			if (!(await canReachProject(socket, projectId))) return;
			const tag = payload.tag ?? '';
			const runTitle = payload.runTitle ?? null;
			const runners =
				Array.isArray(payload.runners) && payload.runners.length > 0
					? payload.runners
					: [BUILT_IN_RUNNER_ID];
			try {
				await runQueueService.enqueue({
					id: payload.runId || randomUUID(),
					projectId,
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
			if (!id) return;
			const row = await prisma.runQueue
				.findUnique({ where: { id }, select: { projectId: true } })
				.catch(() => null);
			if (!row || !(await canReachProject(socket, row.projectId))) return;
			await runQueueService.cancel(id, row.projectId).catch(() => {});
		});

		// A run's execution page joins its room so every collaborator's
		// assignment / result / edit reaches the others live.
		socket.on(SOCKET_EVENTS.TEST_RUN_JOIN, async ({ runId } = {}) => {
			if (!runId) return;
			const run = await prisma.testRun
				.findUnique({ where: { id: runId }, select: { projectId: true } })
				.catch(() => null);
			if (run && (await canReachProject(socket, run.projectId))) socket.join(`test-run:${runId}`);
		});
		socket.on(SOCKET_EVENTS.TEST_RUN_LEAVE, ({ runId } = {}) => {
			if (runId) socket.leave(`test-run:${runId}`);
		});
	});
};

module.exports = socketHandler;
