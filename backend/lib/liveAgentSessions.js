/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Keeps one Claude Agent SDK `query()` alive per AI session, in the SDK's
// streaming-input mode, instead of a fresh one-shot query per chat message.
// The point: Playwright MCP is spawned once per query() call, so a one-shot
// query per message meant a brand-new, empty browser every message, a login
// in message 1 was already gone by message 2. Staying inside the same
// query() across messages keeps the same browser (and its Playwright MCP
// process) open for the life of the session, a real "watch it act live"
// experience instead of a fresh page load per message.
//
// OpenAI has no browser MCP at all (see aiAgentService.runOpenAiTurn), so
// this module only ever holds Anthropic sessions.

const path = require('path');
const { query } = require('@anthropic-ai/claude-agent-sdk');
const settingsService = require('../services/settingsService');
const { createWorkspaceSdkServer } = require('../mcp/workspaceSdkServer');
const { browserProfilePathFor } = require('./aiWorkspaces');

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

// A generous ceiling against a runaway tool-call loop, not a session-length
// limit, "turn" here counts every tool_result round trip too (see
// SDKUserMessage), a handful of chat messages can easily use dozens of these.
// Hitting it ends the underlying query, the next message just starts a fresh
// one (conversation text still resumes via providerSessionId either way).
const MAX_TURNS = 500;

// Idle Playwright browsers are real memory/CPU, not just an idle timer.
const IDLE_CLOSE_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// --headless: no display server in this container (same rule the test runner
// follows, see lib/testsRoot.js), a headed launch here just hangs forever.
// Screenshots the agent takes for the chat's Browser panel work identically
// either way.
function playwrightMcpServerConfig(profileDir) {
	const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js');
	return {
		command: process.execPath,
		args: [cli, '--user-data-dir', profileDir, '--headless']
	};
}

// A minimal push-based async channel: `push()` feeds the SDK's streaming
// input, `close()` ends it so the query (and its MCP child processes) can
// shut down. This is what lets sendMessage() await on one iterator across
// many separate HTTP requests instead of the SDK owning a fixed input array.
function createPushQueue() {
	const buffered = [];
	let pendingResolve = null;
	let closed = false;
	return {
		push(item) {
			if (pendingResolve) {
				const resolve = pendingResolve;
				pendingResolve = null;
				resolve({ value: item, done: false });
			} else {
				buffered.push(item);
			}
		},
		close() {
			closed = true;
			if (pendingResolve) {
				const resolve = pendingResolve;
				pendingResolve = null;
				resolve({ value: undefined, done: true });
			}
		},
		[Symbol.asyncIterator]() {
			return {
				next() {
					if (buffered.length) return Promise.resolve({ value: buffered.shift(), done: false });
					if (closed) return Promise.resolve({ value: undefined, done: true });
					return new Promise((resolve) => {
						pendingResolve = resolve;
					});
				}
			};
		}
	};
}

const live = new Map(); // sessionId -> { query, inputQueue, lock, lastUsed }
const creating = new Map(); // sessionId -> in-flight startSession() promise

async function startSession(ctx, systemPrompt) {
	const org = await settingsService.getOrgRaw();
	if (!org.anthropicApiKey) {
		const e = new Error('Anthropic is not connected. Add a key in Integrations.');
		e.status = 400;
		throw e;
	}
	// Safe only because Plum is single-org: instance-wide, not per-request.
	process.env.ANTHROPIC_API_KEY = org.anthropicApiKey;

	const inputQueue = createPushQueue();
	const workspaceServer = createWorkspaceSdkServer(ctx);
	const profileDir = browserProfilePathFor(ctx.session.id);
	const liveQuery = query({
		prompt: inputQueue,
		options: {
			cwd: ctx.workspacePath,
			model: org.anthropicModel || undefined,
			systemPrompt,
			mcpServers: {
				workspace: workspaceServer,
				playwright: playwrightMcpServerConfig(profileDir)
			},
			disallowedTools: BUILT_IN_TOOLS_TO_BLOCK,
			// Not permissionMode: 'bypassPermissions', the underlying CLI refuses
			// that outright when running as root (Plum's backend container does).
			// canUseTool gets the same "never prompt" effect through the SDK's own
			// host-side approval hook instead, which has no such guard, the real
			// boundary is the workspace sandbox + disallowedTools above either way.
			canUseTool: async (_toolName, input) => ({ behavior: 'allow', updatedInput: input }),
			maxTurns: MAX_TURNS,
			resume: ctx.session.providerSessionId || undefined
		}
	});

	return { query: liveQuery, inputQueue, lock: Promise.resolve(), lastUsed: Date.now() };
}

async function getEntry(ctx, systemPrompt) {
	const existing = live.get(ctx.session.id);
	if (existing) return existing;
	const pending = creating.get(ctx.session.id);
	if (pending) return pending;

	const p = startSession(ctx, systemPrompt).finally(() => creating.delete(ctx.session.id));
	creating.set(ctx.session.id, p);
	const entry = await p;
	live.set(ctx.session.id, entry);
	return entry;
}

async function readOneTurn(entry) {
	const events = [];
	while (true) {
		const { value: msg, done } = await entry.query.next();
		if (done) return { events, ended: true };
		events.push(msg);
		if (msg.type === 'result') return { events, ended: msg.subtype !== 'success' };
	}
}

async function runOnEntry(ctx, entry, message) {
	const turn = entry.lock.then(async () => {
		entry.inputQueue.push({
			type: 'user',
			message: { role: 'user', content: message },
			parent_tool_use_id: null
		});
		const result = await readOneTurn(entry);
		if (result.ended) {
			live.delete(ctx.session.id);
			entry.inputQueue.close();
		}
		return result;
	});
	entry.lock = turn.then(
		() => {},
		() => {}
	);
	return turn;
}

// Resolves once this session's own turn is fully read out, even if other
// messages are queued ahead of it, callers await this before reading `events`.
async function sendMessage(ctx, systemPrompt, message) {
	const entry = await getEntry(ctx, systemPrompt);
	entry.lastUsed = Date.now();
	const result = await runOnEntry(ctx, entry, message);

	// Zero events on the very first read means the underlying CLI process had
	// already exited on its own (it can decide to, e.g. after an unrecoverable
	// auth failure) without us noticing, `live` still pointed at a dead entry.
	// One transparent retry against a freshly started session covers it.
	if (result.events.length > 0) return { events: result.events };
	live.delete(ctx.session.id);
	const fresh = await getEntry(ctx, systemPrompt);
	const retried = await runOnEntry(ctx, fresh, message);
	return { events: retried.events };
}

function closeSession(sessionId) {
	const entry = live.get(sessionId);
	if (!entry) return;
	live.delete(sessionId);
	entry.inputQueue.close();
	entry.query.return?.().catch(() => {});
}

setInterval(() => {
	const now = Date.now();
	for (const [id, entry] of live) {
		if (now - entry.lastUsed > IDLE_CLOSE_MS) closeSession(id);
	}
}, SWEEP_INTERVAL_MS).unref();

module.exports = { sendMessage, closeSession };
