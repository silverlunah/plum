/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// In-process MCP server for the Anthropic adapter: Claude Agent SDK runs this
// inside the same Node process, no network hop and no separate HTTP auth story
// needed (unlike the OpenAI path, which has to reach Plum over the network,
// see workspaceHttpServer.js).

const { createSdkMcpServer, tool } = require('@anthropic-ai/claude-agent-sdk');
const { tools } = require('./workspaceTools');

// `ctx` is fixed per call: one server instance belongs to exactly one session
// for its whole lifetime, so every tool call is already scoped correctly.
function createWorkspaceSdkServer(ctx) {
	return createSdkMcpServer({
		name: 'plum-workspace',
		version: '1.0.0',
		instructions:
			'Your isolated git worktree for this project. Read and write files here, then commit, ' +
			'push and open a pull request when ready, never push to the default branch directly.',
		tools: tools.map((t) => tool(t.name, t.description, t.schema, (args) => t.handler(ctx, args)))
	});
}

module.exports = { createWorkspaceSdkServer };
