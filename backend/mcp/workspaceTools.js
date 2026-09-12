/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * The AI agent's actual capabilities, as plain (name, description, zod shape,
 * handler) specs shared by both transports that expose them: the in-process
 * Claude Agent SDK server (mcp/workspaceSdkServer.js) and the Streamable HTTP
 * server OpenAI's Responses API calls remotely (mcp/workspaceHttpServer.js).
 *
 * Every handler receives `ctx` (the session, its project, and the isolated
 * workspace path) resolved once by the caller, never a raw session id, so a
 * handler can never end up operating on the wrong worktree.
 */

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const simpleGit = require('simple-git');
const githubService = require('../services/githubService');
const aiSessionService = require('../services/aiSessionService');
const runQueueService = require('../services/runQueueService');
const reportService = require('../services/reportService');
const { resolveInWorkspace } = require('../lib/aiWorkspaces');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');

const text = (value) => ({
	content: [
		{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
	]
});

// Large files would blow through the model's context for little benefit, this
// is a guardrail, not a real editor, the agent should read the part it needs.
const MAX_READ_BYTES = 200_000;

const IGNORED_DIR = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);

function walk(dir, root, out) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (IGNORED_DIR.has(entry.name)) continue;
			walk(path.join(dir, entry.name), root, out);
		} else {
			out.push(path.relative(root, path.join(dir, entry.name)));
		}
	}
}

const tools = [
	{
		name: 'read_file',
		description: "Read a file's contents from your workspace.",
		schema: { path: z.string().describe('Path relative to the workspace root') },
		async handler(ctx, { path: relPath }) {
			const target = resolveInWorkspace(ctx.workspacePath, relPath);
			const content = fs.readFileSync(target, 'utf8');
			const truncated = content.length > MAX_READ_BYTES;
			return text(truncated ? content.slice(0, MAX_READ_BYTES) + '\n…(truncated)' : content);
		}
	},
	{
		name: 'write_file',
		description: 'Create or overwrite a file in your workspace.',
		schema: {
			path: z.string().describe('Path relative to the workspace root'),
			content: z.string()
		},
		async handler(ctx, { path: relPath, content }) {
			const target = resolveInWorkspace(ctx.workspacePath, relPath);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content, 'utf8');
			return text(`Wrote ${relPath}`);
		}
	},
	{
		name: 'list_files',
		description: 'List every file in your workspace (or a subfolder of it).',
		schema: {
			path: z.string().optional().describe('Subfolder to list, defaults to the whole workspace')
		},
		async handler(ctx, { path: relPath }) {
			const target = resolveInWorkspace(ctx.workspacePath, relPath || '.');
			const out = [];
			walk(target, ctx.workspacePath, out);
			return text(out.sort());
		}
	},
	{
		name: 'git_diff',
		description: 'See what you have changed so far, uncommitted.',
		schema: {},
		async handler(ctx) {
			const diff = await simpleGit(ctx.workspacePath).diff();
			return text(diff || '(no changes)');
		}
	},
	{
		name: 'commit_changes',
		description: 'Stage and commit everything you have changed so far.',
		schema: { message: z.string().min(1) },
		async handler(ctx, { message }) {
			await githubService.commitAll({ repoPath: ctx.workspacePath, message });
			return text(`Committed: ${message}`);
		}
	},
	{
		name: 'push_branch',
		description: 'Push your commits to your working branch on GitHub.',
		schema: {},
		async handler(ctx) {
			await githubService.pushBranch({
				repoPath: ctx.workspacePath,
				branch: aiSessionService.featureBranch(ctx.session.id)
			});
			return text('Pushed.');
		}
	},
	{
		name: 'open_pull_request',
		description:
			'Open a pull request from your working branch. This is the only way your changes ' +
			'reach the real project, you can never push to the default branch or merge directly.',
		schema: { title: z.string().min(1), body: z.string().optional() },
		async handler(ctx, { title, body }) {
			const pr = await githubService.openPullRequest({
				owner: ctx.project.githubOwner,
				repo: ctx.project.githubRepo,
				head: aiSessionService.featureBranch(ctx.session.id),
				base: ctx.project.githubDefaultBranch,
				title,
				body
			});
			await aiSessionService.recordPullRequest(ctx.session.id, pr.url);
			return text(pr);
		}
	},
	{
		name: 'run_tests',
		description: "Run this project's tests on an available node and get back a job id.",
		schema: {
			tag: z.string().optional().describe('Tag filter, e.g. "@smoke"'),
			runnerIds: z
				.array(z.string())
				.optional()
				.describe('Specific node ids, defaults to the nodes chosen for this session'),
			envOverrides: z
				.record(z.string(), z.string())
				.optional()
				.describe(
					'Env vars to override for this run only, e.g. { "BASE_URL": "https://staging..." }'
				)
		},
		async handler(ctx, { tag, runnerIds, envOverrides }) {
			const defaultRunnerIds = (ctx.session.allowedRunnerIds || BUILT_IN_RUNNER_ID).split(',');
			const id = await runQueueService.enqueue({
				projectId: ctx.project.id,
				kind: TRIGGER_TYPE.AI_AGENT,
				triggerType: TRIGGER_TYPE.AI_AGENT,
				label: ctx.session.title || 'AI agent run',
				tag: tag || '',
				browser: DEFAULT_BROWSER,
				runnerIds: runnerIds?.length ? runnerIds : defaultRunnerIds,
				envOverrides: envOverrides || {},
				startedBy: 'AI agent'
			});
			return text({ jobId: id });
		}
	},
	{
		name: 'get_test_run_status',
		description: 'Check on a run started with run_tests.',
		schema: { jobId: z.string() },
		async handler(ctx, { jobId }) {
			const job = await runQueueService.getJob(jobId, ctx.project.id);
			if (!job) throw new Error('No such run for this project');
			return text(job);
		}
	},
	{
		name: 'analyze_report',
		description:
			'Only works when this session was started from a report\'s "AI Analyze" button. Returns ' +
			"that report's failing scenarios (name, tags, step error messages) plus each one's recent " +
			'pass/fail history, to judge whether a failure is flaky or a real regression before deciding ' +
			'whether to fix anything.',
		schema: {},
		async handler(ctx) {
			if (!ctx.session.reportId) {
				return text({ error: 'This session was not launched from a report.' });
			}
			const analysis = await reportService.getReportAnalysis(ctx.project.id, ctx.session.reportId);
			if (!analysis) return text({ error: 'Report not found.' });
			return text(analysis);
		}
	}
];

module.exports = { tools };
