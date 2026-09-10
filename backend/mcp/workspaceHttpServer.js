/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Streamable-HTTP MCP server for the OpenAI adapter: the Responses API's remote
// MCP tool runs on OpenAI's own infrastructure, so it needs a URL it can reach
// over the network (see routes/aiMcp.routes.js), unlike the Anthropic adapter's
// in-process server (workspaceSdkServer.js), which never leaves this process.

const path = require('path');

// Absolute paths, same as mcp/server.js: bypasses the SDK's wildcard export mapping.
const sdkCjs = path.resolve(
	__dirname,
	'..',
	'node_modules',
	'@modelcontextprotocol',
	'sdk',
	'dist',
	'cjs'
);
const { McpServer } = require(path.join(sdkCjs, 'server', 'mcp.js'));
const { tools } = require('./workspaceTools');

function createWorkspaceHttpServer(ctx) {
	const server = new McpServer({ name: 'plum-workspace', version: '1.0.0' });
	for (const t of tools) {
		server.tool(t.name, t.description, t.schema, (args) => t.handler(ctx, args));
	}
	return server;
}

module.exports = { createWorkspaceHttpServer };
