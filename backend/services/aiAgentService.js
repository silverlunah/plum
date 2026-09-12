/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { OpenAI } = require('openai');
const settingsService = require('./settingsService');
const aiSessionService = require('./aiSessionService');
const prisma = require('./prisma');
const liveAgentSessions = require('../lib/liveAgentSessions');

function buildSystemPrompt(project, session) {
	const parts = [
		"You are Plum's AI test agent. You work only inside the isolated git worktree these tools " +
			'give you access to, never the real project. Propose every change as a pull request, ' +
			'you cannot push to the default branch or merge anything yourself.'
	];
	if (session.reportId) {
		parts.push(
			'This session was started from a failing report, call analyze_report first to see its ' +
				"failures and each one's recent pass/fail history before doing anything else. If the " +
				'history says a failure is flaky, say so rather than "fixing" a test that already works. ' +
				'If it looks like a real regression and you can identify the cause, fix it and open a PR.'
		);
	}
	if (project.aiSystemPrompt) parts.push(project.aiSystemPrompt);
	if (project.aiCodePractices) parts.push(`Coding conventions:\n${project.aiCodePractices}`);
	return parts.join('\n\n');
}

// Delegates to a long-lived, streaming-input query kept open for the whole
// session (see liveAgentSessions), rather than a fresh one-shot query per
// message: Playwright MCP spawns once per query, so a one-shot-per-message
// call would hand the agent a brand-new, logged-out browser every turn.
async function runAnthropicTurn(ctx, systemPrompt, message) {
	return liveAgentSessions.sendMessage(ctx, systemPrompt, message);
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
		previous_response_id: ctx.session.providerSessionId || undefined,
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
	const systemPrompt = buildSystemPrompt(project, session);
	return session.provider === 'openai'
		? runOpenAiTurn(ctx, systemPrompt, message)
		: runAnthropicTurn(ctx, systemPrompt, message);
}

module.exports = { runTurn };
