/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { createMcpServer } = require('../mcp/server');

// Use an absolute path to bypass the SDK's wildcard export mapping, same as mcp/server.js.
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

// Stateless: each request gets its own McpServer + transport, closed once the
// response finishes. Every Plum tool is a one-shot request/response, so there's
// no need to keep a session alive between calls.
async function handleMcp(req, res, next) {
	try {
		const server = createMcpServer({ userId: req.user.userId });
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

router.post('/', jwtAuth, handleMcp);
router.get('/', jwtAuth, handleMcp);
router.delete('/', jwtAuth, handleMcp);

module.exports = router;
