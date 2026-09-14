/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// The agent's whole capability surface, as (name, description, JSON Schema,
// handler) specs both provider loops share. Two disjoint sets, matching the two
// things the user approves separately: investigation is read-only, fixing is the
// only set that can touch a repo. Terminal tools write their result into `sink`.

const fs = require('fs');
const path = require('path');
const githubService = require('../services/githubService');
const runQueueService = require('../services/runQueueService');
const { resolveInside } = require('./aiWorkspaces');
const { TRIGGER_TYPE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { ANALYSIS_VERDICT, isVerdict } = require('../constants/ai');
const { JOB_STATUS } = require('../constants/jobStatus');

// A guardrail, not an editor: the agent should read the part of a file it needs.
const MAX_READ_BYTES = 200_000;
const IGNORED_DIR = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);

const RERUN_POLL_MS = 5_000;
const RERUN_TIMEOUT_MS = 15 * 60 * 1000;

const objectSchema = (properties, required = []) => ({ type: 'object', properties, required });
const str = (description) => ({ type: 'string', description });

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

function listFiles(root, relPath) {
	const target = resolveInside(root, relPath || '.');
	const out = [];
	walk(target, root, out);
	return out.sort().join('\n') || '(empty)';
}

function readFile(root, relPath) {
	const content = fs.readFileSync(resolveInside(root, relPath), 'utf8');
	return content.length > MAX_READ_BYTES
		? content.slice(0, MAX_READ_BYTES) + '\n…(truncated)'
		: content;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Investigation: read-only, plus a rerun to tell a flake from a real failure
// ---------------------------------------------------------------------------

function investigationTools({ projectId, testsRoot, runnerIds, label }, sink) {
	return [
		{
			name: 'list_test_files',
			description: "List every file in this project's tests folder.",
			parameters: objectSchema({}),
			handler: () => listFiles(testsRoot, '.')
		},
		{
			name: 'read_test_file',
			description: "Read a file from this project's tests folder.",
			parameters: objectSchema({ path: str('Path relative to the tests folder root') }, ['path']),
			handler: ({ path: relPath }) => readFile(testsRoot, relPath)
		},
		{
			name: 'rerun_tests',
			description:
				'Re-run tests on the nodes the user selected and wait for the result. Use this to ' +
				'tell a flake from a reproducible failure. Runs the tests as they are committed ' +
				'today, so it cannot verify an edit you have not shipped yet.',
			parameters: objectSchema({
				tag: str('Tag filter, e.g. "@TC-12". Omit to run everything.')
			}),
			handler: async ({ tag }) => {
				const jobId = await runQueueService.enqueue({
					projectId,
					kind: TRIGGER_TYPE.AI_AGENT,
					triggerType: TRIGGER_TYPE.AI_AGENT,
					label,
					tag: tag || '',
					browser: DEFAULT_BROWSER,
					runnerIds,
					startedBy: 'AI analysis'
				});
				const deadline = Date.now() + RERUN_TIMEOUT_MS;
				while (Date.now() < deadline) {
					await sleep(RERUN_POLL_MS);
					const job = await runQueueService.getJob(jobId, projectId);
					if (job && job.status !== JOB_STATUS.RUNNING) {
						return { status: job.status, reportId: job.reportId };
					}
				}
				return { status: 'timed-out' };
			}
		},
		{
			name: 'submit_findings',
			description:
				'Report what you concluded. Call this exactly once, last. Use "test-code" only ' +
				'when the bug is in the E2E test itself and you could fix it in this repo.',
			parameters: objectSchema(
				{
					verdict: {
						type: 'string',
						enum: Object.values(ANALYSIS_VERDICT),
						description:
							'test-code: the E2E test is wrong. product-bug: the app under test is ' +
							'genuinely broken. flake: nondeterministic, the test and the app are fine. ' +
							'unknown: not enough evidence.'
					},
					summary: str('Two or three sentences a reader can act on.'),
					findings: {
						type: 'array',
						description: 'One entry per failing scenario you looked at.',
						items: objectSchema(
							{
								scenario: str('The failing scenario name'),
								cause: str('What actually went wrong'),
								evidence: str('The file, step or error line that shows it')
							},
							['scenario', 'cause']
						)
					},
					recommendation: str('What you would do next.')
				},
				['verdict', 'summary']
			),
			handler: ({ verdict, summary, findings, recommendation }) => {
				sink.verdict = isVerdict(verdict) ? verdict : ANALYSIS_VERDICT.UNKNOWN;
				sink.summary = summary;
				sink.findings = Array.isArray(findings) ? findings : [];
				sink.recommendation = recommendation || '';
				sink.done = true;
				return 'Findings recorded.';
			}
		}
	];
}

// ---------------------------------------------------------------------------
// Fix: an isolated clone, and a pull request as the only way out of it
// ---------------------------------------------------------------------------

function fixTools({ project, workspacePath, branch }, sink) {
	return [
		{
			name: 'list_files',
			description: 'List every file in your workspace (or a subfolder of it).',
			parameters: objectSchema({
				path: str('Subfolder to list, defaults to the whole workspace')
			}),
			handler: ({ path: relPath }) => listFiles(workspacePath, relPath)
		},
		{
			name: 'read_file',
			description: "Read a file's contents from your workspace.",
			parameters: objectSchema({ path: str('Path relative to the workspace root') }, ['path']),
			handler: ({ path: relPath }) => readFile(workspacePath, relPath)
		},
		{
			name: 'write_file',
			description: 'Create or overwrite a file in your workspace.',
			parameters: objectSchema(
				{ path: str('Path relative to the workspace root'), content: str('Full new contents') },
				['path', 'content']
			),
			handler: ({ path: relPath, content }) => {
				const target = resolveInside(workspacePath, relPath);
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.writeFileSync(target, content, 'utf8');
				return `Wrote ${relPath}`;
			}
		},
		{
			name: 'open_pull_request',
			description:
				'Commit everything you changed, push it and open a pull request. This is the only ' +
				'way your changes reach the project, and it ends your turn, so call it last.',
			parameters: objectSchema(
				{
					title: str('Pull request title'),
					body: str('Pull request description: what was wrong and what you changed'),
					summary: str('The same explanation for the user, in two or three sentences')
				},
				['title', 'body']
			),
			handler: async ({ title, body, summary }) => {
				await githubService.commitAll({ repoPath: workspacePath, message: title });
				await githubService.pushBranch({ repoPath: workspacePath, branch });
				const pr = await githubService.openPullRequest({
					owner: project.githubOwner,
					repo: project.githubRepo,
					head: branch,
					base: project.githubDefaultBranch,
					title,
					body
				});
				sink.prUrl = pr.url;
				sink.summary = summary || body;
				sink.done = true;
				return `Opened ${pr.url}`;
			}
		},
		{
			name: 'abandon_fix',
			description: 'Give up on fixing this and explain why. Ends your turn.',
			parameters: objectSchema({ reason: str('Why you cannot fix it') }, ['reason']),
			handler: ({ reason }) => {
				sink.abandonedReason = reason;
				sink.done = true;
				return 'Noted.';
			}
		}
	];
}

module.exports = { investigationTools, fixTools };
