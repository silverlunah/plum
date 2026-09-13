/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const fs = require('fs');
const prisma = require('./prisma');
const githubService = require('./githubService');
const activityService = require('./activityService');
const { ACTIVITY_ACTION } = require('../constants/activity');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { workspacePathFor, browserProfilePathFor } = require('../lib/aiWorkspaces');
const { SOCKET_EVENTS } = require('../constants/socketEvents');

const featureBranch = (sessionId) => `ai/${sessionId}`;

let _io = null;
function setSocketIO(io) {
	_io = io;
}

// Ephemeral, in-memory only: authenticates a remote MCP client (OpenAI's
// Responses API calling back into Plum) for the lifetime of one session. Never
// persisted, so a server restart simply invalidates every in-flight session's
// MCP access, the session itself is still recoverable, the token is not.
const mcpTokens = new Map();

function issueMcpToken(sessionId) {
	const token = crypto.randomBytes(24).toString('hex');
	mcpTokens.set(sessionId, token);
	return token;
}

function verifyMcpToken(sessionId, token) {
	return !!token && mcpTokens.get(sessionId) === token;
}

function revokeMcpToken(sessionId) {
	mcpTokens.delete(sessionId);
}

const select = {
	id: true,
	projectId: true,
	createdById: true,
	provider: true,
	status: true,
	title: true,
	workspacePath: true,
	reportId: true,
	prUrl: true,
	providerSessionId: true,
	transcript: true,
	allowedRunnerIds: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { name: true } }
};

async function getSession(id) {
	return prisma.aiSession.findUnique({ where: { id }, select });
}

// List view, excludes `transcript` for the same reason getReports() excludes
// Report.content, it's the one field that grows with every turn.
async function listSessions(projectId) {
	const { transcript, ...listSelect } = select;
	return prisma.aiSession.findMany({
		where: { projectId },
		select: listSelect,
		orderBy: { updatedAt: 'desc' }
	});
}

// Not filtered by project, same "awareness across projects, redacted by the
// route for ones the caller can't reach" shape as runQueueService.listActive.
async function listActiveSessions() {
	const rows = await prisma.aiSession.findMany({
		where: { status: 'running' },
		include: { project: { select: { name: true } }, createdBy: { select: { name: true } } },
		orderBy: { createdAt: 'asc' }
	});
	return rows.map((r) => ({
		sessionId: r.id,
		projectId: r.projectId,
		projectName: r.project?.name ?? '',
		createdById: r.createdById,
		title: r.title,
		startedBy: r.createdBy?.name ?? null,
		startedAt: r.createdAt.getTime()
	}));
}

// A session's workspace is a fresh clone of the project's connected GitHub
// repo, on its own branch, never the project's own tests folder. There is
// deliberately no local-only fallback: without a GitHub repo there is nowhere
// to open a PR, and "propose a change, never edit directly" is the one
// non-negotiable constraint here.
async function createSession({ projectId, userId, provider, title, reportId, runnerIds }) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project) {
		const e = new Error('Project not found');
		e.status = 404;
		throw e;
	}
	if (!project.githubOwner || !project.githubRepo) {
		const e = new Error(
			'This project has no GitHub repo connected. Connect one in Settings before starting an AI session.'
		);
		e.status = 400;
		throw e;
	}

	const session = await prisma.aiSession.create({
		data: {
			projectId,
			createdById: userId,
			provider,
			status: 'running',
			title: title || '',
			reportId: reportId ?? null,
			allowedRunnerIds: runnerIds?.length ? runnerIds.join(',') : BUILT_IN_RUNNER_ID
		},
		select
	});

	try {
		const workspacePath = workspacePathFor(session.id);
		await githubService.cloneRepo({
			owner: project.githubOwner,
			repo: project.githubRepo,
			destPath: workspacePath,
			branch: project.githubDefaultBranch
		});
		await githubService.createBranch({
			repoPath: workspacePath,
			branch: featureBranch(session.id)
		});

		const updated = await prisma.aiSession.update({
			where: { id: session.id },
			data: { workspacePath },
			select
		});
		await activityService.record(ACTIVITY_ACTION.AI_SESSION_CREATE, {
			projectId,
			target: { type: 'ai_session', id: session.id, label: title || session.id }
		});
		// Coarse start signal stays global for the cross-project run bar, same
		// precedent as BG_RUN_START, the client redacts/locks it as needed.
		if (_io) {
			_io.emit(SOCKET_EVENTS.AI_SESSION_START, {
				sessionId: updated.id,
				projectId,
				projectName: project.name ?? '',
				createdById: updated.createdById,
				label: updated.title || 'AI session',
				meta: { startedBy: updated.createdBy?.name ?? null },
				startedAt: Date.now()
			});
		}
		return updated;
	} catch (e) {
		await prisma.aiSession.update({ where: { id: session.id }, data: { status: 'error' } });
		throw e;
	}
}

async function endSession(id, status) {
	revokeMcpToken(id);
	const session = await prisma.aiSession.update({ where: { id }, data: { status }, select });
	if (_io) _io.emit(SOCKET_EVENTS.AI_SESSION_DONE, { sessionId: id });
	return session;
}

// Deletes the isolated worktree from disk. The AiSession row (and its history)
// stays, only the working copy goes, same "wipe the checkout, keep the record"
// shape as projectPaths.removeProjectDir for a deleted project.
async function removeWorkspace(session) {
	revokeMcpToken(session.id);
	if (session.workspacePath) {
		await fs.promises.rm(session.workspacePath, { recursive: true, force: true });
	}
	await fs.promises.rm(browserProfilePathFor(session.id), { recursive: true, force: true });
}

// Read-modify-write: fine because a session's UI blocks the next send until
// this turn's reply lands, so there is never a concurrent writer per session.
async function appendTurn(id, { userMessage, normalizedMessages, providerSessionId }) {
	const existing = await prisma.aiSession.findUnique({
		where: { id },
		select: { transcript: true }
	});
	const transcript = [
		...existing.transcript,
		{
			role: 'user',
			blocks: [{ type: 'text', text: userMessage }],
			createdAt: new Date().toISOString()
		},
		...normalizedMessages.map((m) => ({ ...m, createdAt: new Date().toISOString() }))
	];
	return prisma.aiSession.update({
		where: { id },
		data: { transcript, providerSessionId: providerSessionId ?? undefined },
		select
	});
}

async function recordPullRequest(id, prUrl) {
	const session = await prisma.aiSession.update({ where: { id }, data: { prUrl }, select });
	await activityService.record(ACTIVITY_ACTION.AI_SESSION_PR_OPENED, {
		projectId: session.projectId,
		target: { type: 'ai_session', id: session.id, label: session.title || session.id },
		metadata: { prUrl }
	});
	return session;
}

module.exports = {
	featureBranch,
	setSocketIO,
	issueMcpToken,
	verifyMcpToken,
	revokeMcpToken,
	getSession,
	listSessions,
	listActiveSessions,
	createSession,
	endSession,
	removeWorkspace,
	appendTurn,
	recordPullRequest
};
