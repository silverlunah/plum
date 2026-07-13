/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

/**
 * Plum MCP Server
 *
 * Exposes Plum's Test Repository and test runner to Claude over stdio.
 *
 * Configuration (env vars):
 *   PLUM_API_URL   — Plum backend base URL (default: http://localhost:3001)
 *   PLUM_API_KEY   — Must match PLUM_MCP_KEY set in backend/.env
 */

const path = require('path');

// Use absolute paths to bypass the SDK's wildcard export mapping
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
const { StdioServerTransport } = require(path.join(sdkCjs, 'server', 'stdio.js'));
const { z } = require('zod');

const API_URL = (process.env.PLUM_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const API_KEY = process.env.PLUM_API_KEY || '';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function api(method, path, body) {
	const res = await fetch(`${API_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `ApiKey ${API_KEY}`
		},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(json.error || `HTTP ${res.status} ${method} ${path}`);
	}
	return json;
}

const get = (path) => api('GET', path);
const post = (path, body) => api('POST', path, body);
const put = (path, body) => api('PUT', path, body);
const del = (path) => api('DELETE', path);

// ---------------------------------------------------------------------------
// Polling helper for test runs
// ---------------------------------------------------------------------------

async function pollJob(jobId, { maxMs = 600_000, intervalMs = 5_000 } = {}) {
	const deadline = Date.now() + maxMs;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, intervalMs));
		const job = await get(`/trigger/${jobId}`);
		if (job.status !== 'running') return job;
	}
	return { status: 'timeout', jobId };
}

// ---------------------------------------------------------------------------
// Report summary helper
// ---------------------------------------------------------------------------

function summariseReport(report) {
	// GET /reports/:id hoists content.features to a top-level `features` key
	// and strips `content` entirely — see reportService.getReportDetail.
	const features = report.features ?? report.content?.features ?? [];
	const allScenarios = features.flatMap((f) => f.scenarios ?? []);
	const total = allScenarios.length;
	const passed = allScenarios.filter((s) => s.status === 'passed').length;
	const failed = allScenarios.filter((s) => s.status === 'failed').length;

	const failedDetails = allScenarios
		.filter((s) => s.status === 'failed')
		.map((s) => {
			const failedStep = (s.steps ?? []).find((st) => st.status === 'failed');
			return {
				scenario: s.name,
				feature: features.find((f) => (f.scenarios ?? []).includes(s))?.name ?? '',
				failedStep: failedStep?.name ?? '',
				error: failedStep?.error ?? ''
			};
		});

	return {
		id: report.id,
		status: report.status,
		browser: report.browser,
		tags: report.tags,
		createdAt: report.createdAt,
		summary: { total, passed, failed },
		failures: failedDetails
	};
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

const SCREENSHOT_FILENAME_RE = /^[\w.-]+\.(png|jpg|jpeg)$/i;

function screenshotUrl(filename) {
	return `${API_URL}/screenshots/${filename}`;
}

const SCREENSHOT_MIME_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
	name: 'plum',
	version: '1.0.0'
});

// -- Test Repository: Suites -------------------------------------------------

server.tool(
	'list_test_suites',
	'List all test suites in the Plum Test Repository.',
	{
		page: z.number().int().positive().optional().describe('Page number (default 1)'),
		limit: z.number().int().positive().max(100).optional().describe('Results per page (default 20)')
	},
	async ({ page = 1, limit = 20 }) => {
		const data = await get(`/test-suites?page=${page}&limit=${limit}`);
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(data, null, 2)
				}
			]
		};
	}
);

server.tool(
	'get_test_suite',
	'Get a test suite by ID, including all its test cases.',
	{
		suiteId: z.string().describe('The suite ID (e.g. the database UUID, not the displayId)')
	},
	async ({ suiteId }) => {
		const data = await get(`/test-suites/${suiteId}`);
		return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
	}
);

server.tool(
	'create_test_suite',
	'Create a new test suite in the Plum Test Repository.',
	{
		name: z.string().min(1).describe('Suite name, e.g. "User Authentication"'),
		description: z.string().optional().describe('What this suite covers'),
		priority: z
			.enum(['Critical', 'High', 'Medium', 'Low'])
			.optional()
			.describe('Suite priority (default Medium)')
	},
	async ({ name, description, priority }) => {
		const data = await post('/test-suites', { name, description, priority });
		return { content: [{ type: 'text', text: JSON.stringify(data.suite, null, 2) }] };
	}
);

server.tool(
	'update_test_suite',
	"Update a test suite's name, description, or priority. Only the fields provided are changed.",
	{
		suiteId: z.string().describe('UUID of the suite to update'),
		name: z.string().min(1).optional(),
		description: z.string().optional(),
		priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional()
	},
	async ({ suiteId, name, description, priority }) => {
		const data = await put(`/test-suites/${suiteId}`, { name, description, priority });
		return { content: [{ type: 'text', text: JSON.stringify(data.suite, null, 2) }] };
	}
);

server.tool(
	'delete_test_suite',
	'Permanently delete a test suite and all of its test cases. This cannot be undone.',
	{
		suiteId: z.string().describe('UUID of the suite to delete')
	},
	async ({ suiteId }) => {
		await del(`/test-suites/${suiteId}`);
		return { content: [{ type: 'text', text: `Suite ${suiteId} deleted.` }] };
	}
);

// -- Test Repository: Cases -------------------------------------------------

server.tool(
	'create_test_case',
	'Create a test case inside an existing test suite.',
	{
		suiteId: z.string().describe('UUID of the parent test suite'),
		title: z.string().min(1).describe('Case title, e.g. "User can log in with valid credentials"'),
		description: z.string().optional().describe('Scope, assumptions, or edge cases'),
		priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional()
	},
	async ({ suiteId, title, description, priority }) => {
		const data = await post('/test-cases', { suiteId, title, description, priority });
		return { content: [{ type: 'text', text: JSON.stringify(data.testCase, null, 2) }] };
	}
);

server.tool(
	'get_test_case',
	'Get a test case by ID, including its manual steps and recent execution history.',
	{
		caseId: z.string().describe('UUID of the test case')
	},
	async ({ caseId }) => {
		const data = await get(`/test-cases/${caseId}`);
		return { content: [{ type: 'text', text: JSON.stringify(data.testCase, null, 2) }] };
	}
);

server.tool(
	'update_test_case',
	"Update a test case's title, description, or priority. Only the fields provided are changed.",
	{
		caseId: z.string().describe('UUID of the test case to update'),
		title: z.string().min(1).optional(),
		description: z.string().optional(),
		priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional()
	},
	async ({ caseId, title, description, priority }) => {
		const data = await put(`/test-cases/${caseId}`, { title, description, priority });
		return { content: [{ type: 'text', text: JSON.stringify(data.testCase, null, 2) }] };
	}
);

server.tool(
	'delete_test_case',
	'Permanently delete a test case and its steps. This cannot be undone.',
	{
		caseId: z.string().describe('UUID of the test case to delete')
	},
	async ({ caseId }) => {
		await del(`/test-cases/${caseId}`);
		return { content: [{ type: 'text', text: `Test case ${caseId} deleted.` }] };
	}
);

server.tool(
	'set_test_steps',
	'Set (replace) the manual test steps for a test case. Each step has an action, optional test data, and optional expected output.',
	{
		caseId: z.string().describe('UUID of the test case'),
		steps: z
			.array(
				z.object({
					action: z.string().describe('What the tester does'),
					testData: z.string().optional().describe('Specific input or data to use'),
					expectedOutput: z.string().optional().describe('What should happen')
				})
			)
			.describe('Ordered list of steps. Replaces any existing steps.')
	},
	async ({ caseId, steps }) => {
		const data = await put(`/test-cases/${caseId}/steps`, { steps });
		return { content: [{ type: 'text', text: JSON.stringify(data.steps, null, 2) }] };
	}
);

// -- Test Runner ------------------------------------------------------------

server.tool(
	'run_tests',
	[
		'Trigger a Plum test run and wait for results. Returns a pass/fail summary.',
		'',
		'For PR testing: pass baseUrl to override the default BASE_URL for this run only.',
		'If the app runs on localhost, use host.docker.internal instead (e.g. http://host.docker.internal:3000)',
		'so the Plum Docker container can reach it.',
		'',
		'Tag filter examples: "@login" "@TC-001 or @TC-002" "@smoke and not @slow"',
		'Leave tag blank to run all tests.'
	].join('\n'),
	{
		tag: z
			.string()
			.optional()
			.describe('Cucumber tag expression to filter scenarios. Leave blank to run all.'),
		browser: z
			.enum(['chromium', 'firefox'])
			.optional()
			.describe('Browser to run tests in (default chromium)'),
		workers: z
			.number()
			.int()
			.positive()
			.max(10)
			.optional()
			.describe('Number of parallel workers (default 1)'),
		baseUrl: z
			.string()
			.url()
			.optional()
			.describe(
				'Override the app URL for this run only. Use host.docker.internal instead of localhost.'
			),
		testRunId: z
			.string()
			.optional()
			.describe(
				'Link results to a Plum Test Run. Automated entries will be marked pass/fail automatically.'
			)
	},
	async ({ tag, browser, workers, baseUrl, testRunId }) => {
		const { jobId } = await post('/trigger', { tag, browser, workers, baseUrl, testRunId });

		const job = await pollJob(jobId);

		if (job.status === 'timeout') {
			return {
				content: [
					{
						type: 'text',
						text: `Tests are still running after 10 minutes. Job ID: ${jobId}\nUse get_run_status("${jobId}") to check later.`
					}
				]
			};
		}

		if (!job.reportId) {
			return {
				content: [
					{
						type: 'text',
						text: `Tests finished with exit code ${job.exitCode} but no report was found. The run may have been cancelled or produced no output.`
					}
				]
			};
		}

		const report = await get(`/reports/${job.reportId}`);
		const summary = summariseReport(report.report ?? report);

		const lines = [
			`Status: ${summary.status?.toUpperCase()}`,
			`Scenarios: ${summary.summary.total} total, ${summary.summary.passed} passed, ${summary.summary.failed} failed`,
			`Browser: ${summary.browser}`,
			`Tags: ${summary.tags || 'all tests'}`,
			''
		];

		if (summary.failures.length > 0) {
			lines.push('Failed scenarios:');
			for (const f of summary.failures) {
				lines.push(`  ✗ ${f.feature} › ${f.scenario}`);
				if (f.failedStep) lines.push(`    Step: ${f.failedStep}`);
				if (f.error) lines.push(`    Error: ${f.error.split('\n')[0]}`);
			}
		} else {
			lines.push('All scenarios passed.');
		}

		lines.push('', `Report ID: ${summary.id}`);

		return { content: [{ type: 'text', text: lines.join('\n') }] };
	}
);

server.tool(
	'get_run_status',
	'Check the status of a test run that was started with run_tests. Returns status, exit code, and report ID when done.',
	{
		jobId: z.string().uuid().describe('Job ID returned by run_tests')
	},
	async ({ jobId }) => {
		const job = await get(`/trigger/${jobId}`);
		return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] };
	}
);

// -- Reports ----------------------------------------------------------------

server.tool(
	'list_reports',
	'List recent Plum test reports.',
	{
		limit: z.number().int().positive().max(50).optional().describe('Number of reports (default 10)')
	},
	async ({ limit = 10 }) => {
		const data = await get(`/reports?limit=${limit}`);
		return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
	}
);

server.tool(
	'get_report_summary',
	'Get a human-readable summary of a Plum test report, including a list of failed scenarios.',
	{
		reportId: z.number().int().describe('Numeric report ID')
	},
	async ({ reportId }) => {
		const data = await get(`/reports/${reportId}`);
		const summary = summariseReport(data.report ?? data);
		const lines = [
			`Report #${summary.id} — ${summary.status?.toUpperCase()}`,
			`Date: ${summary.createdAt}`,
			`Browser: ${summary.browser}`,
			`Tags: ${summary.tags || 'all tests'}`,
			`Scenarios: ${summary.summary.total} total, ${summary.summary.passed} passed, ${summary.summary.failed} failed`,
			''
		];
		if (summary.failures.length > 0) {
			lines.push('Failures:');
			for (const f of summary.failures) {
				lines.push(`  ✗ ${f.feature} › ${f.scenario}`);
				if (f.failedStep) lines.push(`    Step: ${f.failedStep}`);
				if (f.error) lines.push(`    Error: ${f.error.split('\n')[0]}`);
			}
		} else {
			lines.push('All scenarios passed.');
		}
		return { content: [{ type: 'text', text: lines.join('\n') }] };
	}
);

server.tool(
	'get_report_scenario_detail',
	[
		'Get full per-scenario, per-step detail for a Plum test report — the data needed to diagnose',
		"and self-heal a failing test: every step's status, duration, full error message, and",
		'screenshot URL (if one was captured for that step).',
		'',
		'Use get_report_screenshot to fetch the actual screenshot image for a filename returned here,',
		'and get_report_logs for the raw test-run stdout/stderr.'
	].join('\n'),
	{
		reportId: z.number().int().describe('Numeric report ID'),
		onlyFailed: z
			.boolean()
			.optional()
			.describe('Only include scenarios with a failed step (default true)')
	},
	async ({ reportId, onlyFailed = true }) => {
		const data = await get(`/reports/${reportId}`);
		const features = data.features ?? data.content?.features ?? [];

		const scenarios = features.flatMap((feature) =>
			(feature.scenarios ?? [])
				.filter((s) => !onlyFailed || s.status === 'failed')
				.map((s) => ({
					feature: feature.name,
					scenario: s.name,
					tags: s.tags ?? [],
					status: s.status,
					duration: s.duration,
					steps: (s.steps ?? []).map((st) => ({
						keyword: st.keyword,
						name: st.name,
						status: st.status,
						duration: st.duration,
						error: st.error ?? null,
						screenshot: st.screenshot ?? null,
						screenshotUrl: st.screenshot ? screenshotUrl(st.screenshot) : null
					}))
				}))
		);

		return { content: [{ type: 'text', text: JSON.stringify({ reportId, scenarios }, null, 2) }] };
	}
);

server.tool(
	'get_report_screenshot',
	'Fetch a screenshot captured during a test step and return it as an image, so it can be viewed ' +
		"directly. Get the filename from get_report_scenario_detail's step.screenshot field.",
	{
		filename: z.string().describe('Screenshot filename, e.g. "3f9c1e2a-....png"')
	},
	async ({ filename }) => {
		if (!SCREENSHOT_FILENAME_RE.test(filename)) {
			throw new Error(`Invalid screenshot filename: ${filename}`);
		}
		const res = await fetch(screenshotUrl(filename));
		if (!res.ok) throw new Error(`Screenshot not found: ${filename}`);
		const buffer = Buffer.from(await res.arrayBuffer());
		const ext = filename.split('.').pop().toLowerCase();

		return {
			content: [
				{
					type: 'image',
					data: buffer.toString('base64'),
					mimeType: SCREENSHOT_MIME_TYPES[ext]
				}
			]
		};
	}
);

server.tool(
	'get_report_logs',
	'Get the raw stdout/stderr log output captured during a Plum test run, tagged per runner. ' +
		'Useful for diagnosing failures with no clear step-level error (crashes, timeouts, setup errors).',
	{
		reportId: z.number().int().describe('Numeric report ID'),
		tail: z
			.number()
			.int()
			.positive()
			.optional()
			.describe('Only return the last N lines (default: full log)')
	},
	async ({ reportId, tail }) => {
		const data = await get(`/reports/${reportId}`);
		let logs = data.logs ?? '';
		if (tail) {
			logs = logs.split('\n').slice(-tail).join('\n');
		}
		return { content: [{ type: 'text', text: logs || '(no logs captured for this report)' }] };
	}
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
