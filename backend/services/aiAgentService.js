/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { query } = require('@anthropic-ai/claude-agent-sdk');
const { OpenAI } = require('openai');
const path = require('path');
const settingsService = require('./settingsService');
const aiSessionService = require('./aiSessionService');
const prisma = require('./prisma');
const { createWorkspaceSdkServer } = require('../mcp/workspaceSdkServer');

// Claude Code's own built-in tools, unrelated to anything this session's MCP
// server exposes. Left enabled, the agent could read or write anywhere on the
// host's filesystem, or shell out, defeating the whole point of the isolated
// workspace below, so they are blocked outright rather than trusted to go unused.
const BUILT_IN_TOOLS_TO_BLOCK = [
	'Bash',
	'Read',
	'Write',
	'Edit',
	'Glob',
	'Grep',
	'WebFetch',
	'WebSearch',
	'NotebookEdit',
	'Task'
];

function buildSystemPrompt(project) {
	const parts = [
		"You are Plum's AI test agent. You work only inside the isolated git worktree these tools " +
			'give you access to, never the real project. Propose every change as a pull request, ' +
			'you cannot push to the default branch or merge anything yourself.'
	];
	if (project.aiSystemPrompt) parts.push(project.aiSystemPrompt);
	if (project.aiCodePractices) parts.push(`Coding conventions:\n${project.aiCodePractices}`);
	return parts.join('\n\n');
}

// `@playwright/mcp`'s CLI, invoked via an absolute path + the node binary
// rather than the npx/`.bin` wrapper, so this spawns identically on Windows
// (see CLAUDE.md's spawn rules) regardless of how the SDK itself shells out.
function playwrightMcpServerConfig() {
	const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js');
	return { command: process.execPath, args: [cli] };
}

async function runAnthropicTurn(ctx, systemPrompt, message) {
	const org = await settingsService.getOrgRaw();
	if (!org.anthropicApiKey) {
		const e = new Error('Anthropic is not connected. Add a key in Integrations.');
		e.status = 400;
		throw e;
	}
	// Safe only because Plum is single-org: this is instance-wide, not
	// per-request, so every concurrent session sets the same value.
	process.env.ANTHROPIC_API_KEY = org.anthropicApiKey;

	const workspaceServer = createWorkspaceSdkServer(ctx);
	const events = [];
	for await (const msg of query({
		prompt: message,
		options: {
			cwd: ctx.workspacePath,
			model: org.anthropicModel || undefined,
			systemPrompt,
			mcpServers: { workspace: workspaceServer, playwright: playwrightMcpServerConfig() },
			disallowedTools: BUILT_IN_TOOLS_TO_BLOCK,
			permissionMode: 'bypassPermissions',
			maxTurns: 30
		}
	})) {
		events.push(msg);
	}
	return { events };
}

async function runOpenAiTurn(ctx, systemPrompt, message) {
	const org = await settingsService.getOrgRaw();
	if (!org.openaiApiKey) {
		const e = new Error('OpenAI is not connected. Add a key in Integrations.');
		e.status = 400;
		throw e;
	}
	const apiUrl = (process.env.PLUM_API_URL || '').replace(/\/+$/, '');
	if (!apiUrl) {
		const e = new Error(
			'The OpenAI provider needs PLUM_API_URL set to a URL OpenAI can reach, this instance has none configured.'
		);
		e.status = 400;
		throw e;
	}

	const token = aiSessionService.issueMcpToken(ctx.session.id);
	const client = new OpenAI({ apiKey: org.openaiApiKey });
	const response = await client.responses.create({
		model: org.openaiModel || 'gpt-5',
		instructions: systemPrompt,
		input: message,
		tools: [
			{
				type: 'mcp',
				server_label: 'plum_workspace',
				server_url: `${apiUrl}/ai-mcp/${ctx.session.id}`,
				authorization: token,
				require_approval: 'never'
			}
			// No Playwright MCP here: it would need its own publicly reachable
			// HTTP endpoint, unlike the Anthropic adapter's in-process server,
			// this provider does not get live browser control yet.
		]
	});
	return { response };
}

async function runTurn(session, message) {
	const project = await prisma.project.findUnique({ where: { id: session.projectId } });
	const ctx = { session, project, workspacePath: session.workspacePath };
	const systemPrompt = buildSystemPrompt(project);
	return session.provider === 'openai'
		? runOpenAiTurn(ctx, systemPrompt, message)
		: runAnthropicTurn(ctx, systemPrompt, message);
}

module.exports = { runTurn };
