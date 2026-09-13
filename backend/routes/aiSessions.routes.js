/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const aiSessionService = require('../services/aiSessionService');
const aiAgentService = require('../services/aiAgentService');
const { normalizeTurn, extractResumeKey } = require('../lib/aiTranscript');
const liveAgentSessions = require('../lib/liveAgentSessions');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const { ELEVATED_ROLES } = require('../constants/roles');

const scoped = [jwtAuth, requireProjectAccess];

// Anyone on the project can start their own session, but only its own creator
// (or an elevated role) can see into it, same privacy the run queue already
// gives a plain member's own runs.
function canOpen(session, user) {
	return session.createdById === user.userId || ELEVATED_ROLES.includes(user.role);
}

router.get('/', scoped, async (req, res, next) => {
	try {
		const sessions = await aiSessionService.listSessions(req.projectId);
		res.json(sessions.filter((s) => canOpen(s, req.user)));
	} catch (e) {
		next(e);
	}
});

router.post('/', scoped, async (req, res, next) => {
	try {
		const { provider, title, reportId, runnerIds } = req.body;
		if (provider !== 'anthropic' && provider !== 'openai') {
			return res.status(400).json({ error: 'provider must be "anthropic" or "openai"' });
		}
		const session = await aiSessionService.createSession({
			projectId: req.projectId,
			userId: req.user.userId,
			provider,
			title,
			reportId,
			runnerIds
		});
		res.status(201).json(session);
	} catch (e) {
		next(e);
	}
});

router.get('/:id', scoped, async (req, res, next) => {
	try {
		const session = await aiSessionService.getSession(req.params.id);
		if (!session || session.projectId !== req.projectId) {
			return res.status(404).json({ error: 'Session not found' });
		}
		if (!canOpen(session, req.user)) return res.status(403).json({ error: 'Not your session' });
		res.json(session);
	} catch (e) {
		next(e);
	}
});

router.post('/:id/message', scoped, async (req, res, next) => {
	try {
		const session = await aiSessionService.getSession(req.params.id);
		if (!session || session.projectId !== req.projectId) {
			return res.status(404).json({ error: 'Session not found' });
		}
		if (!canOpen(session, req.user)) return res.status(403).json({ error: 'Not your session' });
		const { message } = req.body;
		if (!message) return res.status(400).json({ error: 'message is required' });
		const result = await aiAgentService.runTurn(session, message);
		const { messages } = normalizeTurn(session.provider, result);
		const updated = await aiSessionService.appendTurn(session.id, {
			userMessage: message,
			normalizedMessages: messages,
			providerSessionId: extractResumeKey(session.provider, result)
		});
		res.json(updated);
	} catch (e) {
		next(e);
	}
});

router.delete('/:id', scoped, async (req, res, next) => {
	try {
		const session = await aiSessionService.getSession(req.params.id);
		if (!session || session.projectId !== req.projectId) {
			return res.status(404).json({ error: 'Session not found' });
		}
		if (!canOpen(session, req.user)) return res.status(403).json({ error: 'Not your session' });
		liveAgentSessions.closeSession(session.id);
		await aiSessionService.removeWorkspace(session);
		await aiSessionService.endSession(session.id, 'done');
		res.json({ ok: true });
	} catch (e) {
		next(e);
	}
});

module.exports = router;
