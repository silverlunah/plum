/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const express = require('express');
const router = express.Router();
const prisma = require('../services/prisma');
const aiSessionService = require('../services/aiSessionService');
const { createWorkspaceHttpServer } = require('../mcp/workspaceHttpServer');

const sdkCjs = path.resolve(
	__dirname,
	'..',
	'node_modules',
	'@modelcontextprotocol',
	'sdk',
	'dist',
	'cjs'
);
const { StreamableHTTPServerTransport } = require(path.join(sdkCjs, 'server', 'streamableHttp.js'));

// Not behind jwtAuth: the caller is OpenAI's own infrastructure, not a Plum
// user's browser. Auth is a per-session bearer token minted only for the
// lifetime of that AI session (aiSessionService.issueMcpToken), checked here
// instead of a login.
async function handleWorkspaceMcp(req, res, next) {
	try {
		const { sessionId } = req.params;
		const auth = req.headers.authorization || '';
		const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
		if (!aiSessionService.verifyMcpToken(sessionId, token)) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		const session = await aiSessionService.getSession(sessionId);
		if (!session || !session.workspacePath) {
			return res.status(404).json({ error: 'Session not found' });
		}
		const project = await prisma.project.findUnique({ where: { id: session.projectId } });

		const server = createWorkspaceHttpServer({
			session,
			project,
			workspacePath: session.workspacePath
		});
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		res.on('close', () => {
			transport.close();
			server.close();
		});
		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	} catch (e) {
		next(e);
	}
}

router.post('/:sessionId', handleWorkspaceMcp);
router.get('/:sessionId', handleWorkspaceMcp);
router.delete('/:sessionId', handleWorkspaceMcp);

module.exports = router;
