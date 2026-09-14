/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const reportService = require('./reportService');
const githubService = require('./githubService');
const activityService = require('./activityService');
const { resolveProvider, runAgent } = require('../lib/aiProvider');
const { investigationTools, fixTools } = require('../lib/aiTools');
const { workspacePathFor, removeWorkspace } = require('../lib/aiWorkspaces');
const { resolveTestsRoot } = require('../lib/testsRoot');
const { ACTIVITY_ACTION } = require('../constants/activity');
const { ANALYSIS_STATUS, ANALYSIS_VERDICT } = require('../constants/ai');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { REPORT_STATUS } = require('../constants/jobStatus');

const MAX_ROUNDS = 40;
// Past the first few, failures are almost always the same cause, so mostly tokens.
const MAX_SCREENSHOTS = 4;

const featureBranch = (analysisId) => `plum-ai/${analysisId}`;

// `workspacePath` and `allowedRunnerIds` are internal plumbing, they never reach the client.
const select = {
	id: true,
	reportId: true,
	attempt: true,
	status: true,
	verdict: true,
	summary: true,
	findings: true,
	recommendation: true,
	prUrl: true,
	error: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { name: true } }
};

const IN_FLIGHT = [ANALYSIS_STATUS.ANALYZING, ANALYSIS_STATUS.FIXING];

function httpError(message, status) {
	const e = new Error(message);
	e.status = status;
	throw e;
}

async function findReport(projectId, reportId) {
	const report = await prisma.report.findFirst({
		where: { id: reportId, projectId },
		select: { id: true, status: true }
	});
	if (!report) httpError('Report not found', 404);
	return report;
}

async function latestFor(reportId) {
	return prisma.reportAnalysis.findFirst({
		where: { reportId },
		orderBy: { createdAt: 'desc' },
		select
	});
}

async function getLatest(projectId, reportId) {
	await findReport(projectId, reportId);
	return latestFor(reportId);
}

// A row left mid-run by a restart would wedge its report behind the in-flight guard.
async function resetStale() {
	await prisma.reportAnalysis.updateMany({
		where: { status: { in: IN_FLIGHT } },
		data: { status: ANALYSIS_STATUS.ERROR, error: 'Interrupted by a server restart' }
	});
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function projectVoice(project) {
	return [
		project.aiSystemPrompt,
		project.aiCodePractices && `Coding conventions:\n${project.aiCodePractices}`
	].filter(Boolean);
}

function investigationSystemPrompt(project) {
	return [
		"You are Plum's report analyst. An end-to-end test run failed and a user asked you to " +
			'find out why.',
		"You are read-only here: you can list and read this project's test files, and re-run its " +
			'tests on the nodes the user selected. You cannot change anything yet.',
		'Settle on exactly one verdict:\n' +
			'- test-code: the E2E test itself is wrong (stale selector, bad assertion, missing wait, wrong fixture).\n' +
			'- product-bug: the application under test is genuinely broken.\n' +
			'- flake: nondeterministic, the test and the app are both fine.\n' +
			'- unknown: the evidence does not support any of the above.',
		'Each failure comes with its recent pass/fail history and a flake signal. Weigh those ' +
			'first: a re-run is slow and takes a node away from the team, so only re-run when the ' +
			'history is genuinely inconclusive.',
		'Finish by calling submit_findings exactly once. Name the files, steps and error lines you ' +
			'based the verdict on, and never claim a fix you have not verified.',
		...projectVoice(project)
	].join('\n\n');
}

function fixSystemPrompt(project) {
	return [
		"You are Plum's test-fixing agent. An earlier analysis concluded this project's E2E test " +
			'code is at fault and the user approved a fix.',
		`You have an isolated clone of the repository on your own branch. The tests live under ` +
			`"${project.testsPath}/". Make the smallest change that addresses the real cause.`,
		'A pull request is the only way your work reaches the project, you cannot push to the ' +
			'default branch or merge. Call open_pull_request when you are done.',
		'You cannot run the tests from this workspace, so the pull request has to stand on its ' +
			'own: say what was wrong, what you changed, and how a reviewer can verify it. If you ' +
			'are not confident, call abandon_fix and explain instead of guessing.',
		...projectVoice(project)
	].join('\n\n');
}

function priorAttemptsNote(previous) {
	const graded = previous.filter((p) => p.verdict);
	if (graded.length === 0) return '';
	const lines = graded.map((p) => `- attempt ${p.attempt} said "${p.verdict}": ${p.summary}`);
	return (
		'\n\nThe user was not satisfied with the earlier analyses below and asked for a fresh ' +
		'look. Approach this from a different angle, and do not simply restate them.\n' +
		lines.join('\n')
	);
}

function investigationPrompt(data, previous) {
	// Screenshots travel as image blocks, not as base64 inside this JSON.
	const failures = data.failures.map(({ screenshot, ...rest }) => rest);
	return (
		`Report #${data.reportId} failed on ${data.browser} at ${data.createdAt}.\n\n` +
		`Failing scenarios:\n${JSON.stringify(failures, null, 2)}` +
		priorAttemptsNote(previous)
	);
}

function fixPrompt(analysis, data) {
	const failures = data.failures.map(({ screenshot, ...rest }) => rest);
	return (
		`Your own analysis of report #${data.reportId}:\n${analysis.summary}\n\n` +
		`Findings:\n${JSON.stringify(analysis.findings, null, 2)}\n\n` +
		`Recommendation:\n${analysis.recommendation || '(none)'}\n\n` +
		`The raw failures:\n${JSON.stringify(failures, null, 2)}`
	);
}

const screenshotsFrom = (data) =>
	data.failures
		.map((f) => f.screenshot)
		.filter(Boolean)
		.slice(0, MAX_SCREENSHOTS);

// ---------------------------------------------------------------------------
// Investigate
// ---------------------------------------------------------------------------

async function markError(analysisId, e) {
	console.error(`[ai-analysis] ${analysisId}:`, e);
	await prisma.reportAnalysis
		.update({
			where: { id: analysisId },
			data: { status: ANALYSIS_STATUS.ERROR, error: e.message || 'The analysis failed.' }
		})
		.catch(() => {});
}

async function investigate({ analysisId, projectId, reportId, runnerIds, previous }) {
	const [credentials, project, data] = await Promise.all([
		resolveProvider(),
		prisma.project.findUnique({ where: { id: projectId } }),
		reportService.getReportAnalysis(projectId, reportId)
	]);
	if (!data) httpError('Report not found', 404);

	const sink = {};
	await runAgent({
		...credentials,
		systemPrompt: investigationSystemPrompt(project),
		prompt: investigationPrompt(data, previous),
		images: screenshotsFrom(data),
		tools: investigationTools(
			{
				projectId,
				testsRoot: resolveTestsRoot(projectId),
				runnerIds,
				label: `AI check for report #${reportId}`
			},
			sink
		),
		maxRounds: MAX_ROUNDS,
		isDone: () => sink.done === true
	});
	if (!sink.done) throw new Error('The analysis ran out of steps before reaching a verdict.');

	return prisma.reportAnalysis.update({
		where: { id: analysisId },
		data: {
			status: ANALYSIS_STATUS.DONE,
			verdict: sink.verdict,
			summary: sink.summary,
			findings: sink.findings,
			recommendation: sink.recommendation,
			error: ''
		},
		select
	});
}

async function start({ projectId, reportId, userId, runnerIds }) {
	const report = await findReport(projectId, reportId);
	if (report.status !== REPORT_STATUS.FAIL) {
		httpError('Only a failed report can be analyzed.', 400);
	}

	const previous = await prisma.reportAnalysis.findMany({
		where: { reportId },
		orderBy: { createdAt: 'asc' },
		select: { attempt: true, status: true, verdict: true, summary: true }
	});
	if (previous.some((p) => IN_FLIGHT.includes(p.status))) {
		httpError('An analysis of this report is already running.', 409);
	}

	const ids = runnerIds?.length ? runnerIds : [BUILT_IN_RUNNER_ID];
	const analysis = await prisma.reportAnalysis.create({
		data: {
			reportId,
			createdById: userId,
			attempt: previous.length + 1,
			status: ANALYSIS_STATUS.ANALYZING,
			allowedRunnerIds: ids.join(',')
		},
		select
	});
	await activityService.record(ACTIVITY_ACTION.REPORT_ANALYSIS_RUN, {
		projectId,
		target: { type: 'report', id: reportId, label: `report #${reportId}` }
	});

	// Detached: this takes minutes and the client polls for the result.
	investigate({ analysisId: analysis.id, projectId, reportId, runnerIds: ids, previous }).catch(
		(e) => markError(analysis.id, e)
	);
	return analysis;
}

// ---------------------------------------------------------------------------
// Fix and open a pull request
// ---------------------------------------------------------------------------

async function fix({ analysisId, projectId, reportId, analysis }) {
	const [credentials, project, data] = await Promise.all([
		resolveProvider(),
		prisma.project.findUnique({ where: { id: projectId } }),
		reportService.getReportAnalysis(projectId, reportId)
	]);
	const workspacePath = workspacePathFor(analysisId);
	const branch = featureBranch(analysisId);
	const sink = {};

	try {
		await githubService.cloneRepo({
			owner: project.githubOwner,
			repo: project.githubRepo,
			destPath: workspacePath,
			branch: project.githubDefaultBranch
		});
		await githubService.createBranch({ repoPath: workspacePath, branch });
		await prisma.reportAnalysis.update({ where: { id: analysisId }, data: { workspacePath } });

		await runAgent({
			...credentials,
			systemPrompt: fixSystemPrompt(project),
			prompt: fixPrompt(analysis, data),
			images: screenshotsFrom(data),
			tools: fixTools({ project, workspacePath, branch }, sink),
			maxRounds: MAX_ROUNDS,
			isDone: () => sink.done === true
		});
	} finally {
		// The branch is pushed by then, so the checkout itself is disposable.
		await removeWorkspace(analysisId).catch(() => {});
	}

	if (!sink.prUrl) {
		// Abandoning is an outcome, not a crash: the findings stay readable.
		return prisma.reportAnalysis.update({
			where: { id: analysisId },
			data: {
				status: ANALYSIS_STATUS.DONE,
				workspacePath: '',
				error: sink.abandonedReason || 'The agent could not produce a fix.'
			},
			select
		});
	}

	const updated = await prisma.reportAnalysis.update({
		where: { id: analysisId },
		data: {
			status: ANALYSIS_STATUS.FIXED,
			prUrl: sink.prUrl,
			summary: sink.summary || analysis.summary,
			workspacePath: '',
			error: ''
		},
		select
	});
	await activityService.record(ACTIVITY_ACTION.REPORT_ANALYSIS_PR_OPENED, {
		projectId,
		target: { type: 'report', id: reportId, label: `report #${reportId}` },
		metadata: { prUrl: sink.prUrl }
	});
	return updated;
}

async function startFix({ projectId, reportId, analysisId }) {
	await findReport(projectId, reportId);
	const analysis = await prisma.reportAnalysis.findUnique({ where: { id: analysisId } });
	if (!analysis || analysis.reportId !== reportId) httpError('Analysis not found', 404);
	if (analysis.status !== ANALYSIS_STATUS.DONE) {
		httpError('This analysis is not ready for a fix.', 409);
	}
	if (analysis.verdict !== ANALYSIS_VERDICT.TEST_CODE) {
		httpError('The analysis did not find a fault in the test code.', 400);
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { githubOwner: true, githubRepo: true }
	});
	if (!project.githubOwner || !project.githubRepo) {
		httpError(
			'This project has no GitHub repo connected, so there is nowhere to open a pull request.',
			400
		);
	}

	const updated = await prisma.reportAnalysis.update({
		where: { id: analysisId },
		data: { status: ANALYSIS_STATUS.FIXING, error: '' },
		select
	});
	fix({ analysisId, projectId, reportId, analysis }).catch((e) => markError(analysisId, e));
	return updated;
}

module.exports = { getLatest, start, startFix, resetStale };
