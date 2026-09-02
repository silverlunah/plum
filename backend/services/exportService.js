/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { toCsv } = require('../lib/csv');
const { REPORT_STATUS } = require('../constants/jobStatus');

const EXPORT_VERSION = 1;

const RESULT_LABEL = {
	pass: 'Passed',
	fail: 'Failed',
	blocked: 'Blocked',
	skip: 'Skipped',
	pending: 'Pending',
	passed: 'Passed',
	failed: 'Failed',
	skipped: 'Skipped'
};

const resultLabel = (r) => (r ? (RESULT_LABEL[r] ?? r) : '');
const iso = (d) => (d ? new Date(d).toISOString() : null);
const yesNo = (b) => (b ? 'Yes' : 'No');
const baseName = (uri) =>
	String(uri ?? '')
		.split(/[\\/]/)
		.pop() || '';

// ── Test cases / suites / runs ───────────────────────────────────────────────

const caseHistoryLatest = {
	orderBy: { executedAt: 'desc' },
	take: 1,
	select: {
		result: true,
		notes: true,
		executedAt: true,
		executedBy: { select: { name: true } },
		run: { select: { title: true } }
	}
};

function shapeCase(c, { result = null, notes = null, testedBy = null, testedAt = null } = {}) {
	const last = c.history?.[0];
	return {
		displayId: c.displayId,
		title: c.title,
		description: c.description,
		priority: c.priority,
		isAutomated: c.isAutomated,
		steps: (c.steps ?? []).map((s) => ({
			order: s.order,
			action: s.action,
			testData: s.testData,
			expectedOutput: s.expectedOutput
		})),
		result: result ? resultLabel(result) : null,
		notes: notes ?? last?.notes ?? '',
		lastResult: resultLabel(last?.result),
		lastTestedAt: testedAt ? iso(testedAt) : iso(last?.executedAt),
		lastTestedBy: testedBy ?? last?.executedBy?.name ?? ''
	};
}

async function buildTestCaseExport(projectId, scope, { suiteId, runId } = {}) {
	if (scope === 'run') {
		const run = await prisma.testRun.findFirst({
			where: { id: runId, projectId },
			select: {
				id: true,
				title: true,
				status: true,
				createdAt: true,
				createdBy: { select: { name: true } },
				entries: {
					orderBy: { order: 'asc' },
					select: {
						status: true,
						notes: true,
						executedAt: true,
						executedBy: { select: { name: true } },
						case: {
							select: {
								displayId: true,
								title: true,
								description: true,
								priority: true,
								isAutomated: true,
								steps: { orderBy: { order: 'asc' } },
								suite: {
									select: { displayId: true, name: true, description: true, priority: true }
								},
								history: caseHistoryLatest
							}
						}
					}
				}
			}
		});
		if (!run) return null;

		const bySuite = new Map();
		for (const entry of run.entries) {
			const s = entry.case.suite;
			if (!bySuite.has(s.displayId)) {
				bySuite.set(s.displayId, {
					displayId: s.displayId,
					name: s.name,
					description: s.description,
					priority: s.priority,
					cases: []
				});
			}
			bySuite.get(s.displayId).cases.push(
				shapeCase(entry.case, {
					result: entry.status,
					notes: entry.notes,
					testedBy: entry.executedBy?.name ?? '',
					testedAt: entry.executedAt
				})
			);
		}

		return {
			plumExport: 'test-cases',
			version: EXPORT_VERSION,
			exportedAt: new Date().toISOString(),
			scope: 'run',
			run: {
				title: run.title,
				status: run.status,
				createdAt: iso(run.createdAt),
				createdBy: run.createdBy?.name ?? ''
			},
			suites: [...bySuite.values()]
		};
	}

	const where = scope === 'suite' ? { id: suiteId, projectId } : { projectId };
	const suites = await prisma.testSuite.findMany({
		where,
		orderBy: { createdAt: 'asc' },
		select: {
			displayId: true,
			name: true,
			description: true,
			priority: true,
			cases: {
				orderBy: { createdAt: 'asc' },
				select: {
					displayId: true,
					title: true,
					description: true,
					priority: true,
					isAutomated: true,
					steps: { orderBy: { order: 'asc' } },
					history: caseHistoryLatest
				}
			}
		}
	});
	if (scope === 'suite' && suites.length === 0) return null;

	return {
		plumExport: 'test-cases',
		version: EXPORT_VERSION,
		exportedAt: new Date().toISOString(),
		scope: scope === 'suite' ? 'suite' : 'all',
		suites: suites.map((s) => ({
			displayId: s.displayId,
			name: s.name,
			description: s.description,
			priority: s.priority,
			cases: s.cases.map((c) => shapeCase(c))
		}))
	};
}

const TEST_CASE_CSV_HEADER = [
	'Suite ID',
	'Suite',
	'Case ID',
	'Title',
	'Priority',
	'Automated',
	'Step',
	'Action',
	'Test Data',
	'Expected Output',
	'Result',
	'Last Result',
	'Last Tested',
	'Last Tested By',
	'Notes'
];

const BLANK = '';

// A value only prints on the first row of the group it labels, the suite id on
// the first row of the suite, the case columns on the case's first step, so a
// spreadsheet reads as nested blocks instead of every column repeating down.
function testCaseCsvRows(data) {
	const rows = [TEST_CASE_CSV_HEADER];
	for (const suite of data.suites) {
		let suiteShown = false;
		for (const c of suite.cases) {
			const caseHead = [c.displayId, c.title, c.priority, yesNo(c.isAutomated)];
			const tail = [
				c.result ?? '',
				c.lastResult ?? '',
				c.lastTestedAt ? c.lastTestedAt.slice(0, 10) : '',
				c.lastTestedBy ?? '',
				c.notes ?? ''
			];
			const steps = c.steps.length ? c.steps : [null];
			steps.forEach((step, i) => {
				const first = i === 0;
				rows.push([
					suiteShown ? BLANK : suite.displayId,
					suiteShown ? BLANK : suite.name,
					...(first ? caseHead : [BLANK, BLANK, BLANK, BLANK]),
					step ? i + 1 : BLANK,
					step?.action ?? BLANK,
					step?.testData ?? BLANK,
					step?.expectedOutput ?? BLANK,
					...(first ? tail : [BLANK, BLANK, BLANK, BLANK, BLANK])
				]);
				suiteShown = true;
			});
		}
	}
	return rows;
}

// ── Reports ─────────────────────────────────────────────────────────────────

async function buildReportExport(projectId, id) {
	const reportService = require('./reportService');
	const detail = await reportService.getReportDetail(projectId, id);
	if (!detail) return null;

	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let flaky = 0;
	let steps = 0;
	let scenarioCount = 0;

	const features = detail.features.map((f) => ({
		name: f.name,
		file: baseName(f.uri),
		result: f.status === 'failed' ? 'Failed' : 'Passed',
		scenarios: f.scenarios.map((sc) => {
			scenarioCount += 1;
			if (sc.status === 'failed') failed += 1;
			else if (sc.status === 'skipped') skipped += 1;
			else passed += 1;
			if (sc.flaky) flaky += 1;
			steps += sc.steps.length;
			return {
				name: sc.name,
				tags: sc.tags,
				result: resultLabel(sc.status),
				flaky: !!sc.flaky,
				durationMs: sc.duration,
				attempts: sc.attempts,
				steps: sc.steps.map((st) => ({
					keyword: st.keyword,
					text: st.name,
					status: resultLabel(st.status),
					durationMs: st.duration,
					error: st.error ?? ''
				}))
			};
		})
	}));

	return {
		plumExport: 'report',
		version: EXPORT_VERSION,
		exportedAt: new Date().toISOString(),
		report: {
			id: detail.id,
			result: detail.status === REPORT_STATUS.PASS ? 'Passed' : 'Failed',
			tags: detail.tags,
			trigger: detail.triggerType,
			browser: detail.browser,
			runAt: iso(detail.createdAt),
			durationMs: detail.duration ?? 0,
			testRun: detail.testRun?.title ?? null,
			totals: { scenarios: scenarioCount, passed, failed, skipped, flaky, steps }
		},
		features
	};
}

const REPORT_CSV_HEADER = [
	'Feature',
	'Scenario',
	'Tags',
	'Scenario Result',
	'Step',
	'Keyword',
	'Step Text',
	'Step Result',
	'Duration (ms)',
	'Error'
];

function reportCsvRows(data) {
	const rows = [REPORT_CSV_HEADER];
	for (const feature of data.features) {
		let featureShown = false;
		for (const sc of feature.scenarios) {
			const steps = sc.steps.length ? sc.steps : [null];
			steps.forEach((st, i) => {
				const first = i === 0;
				rows.push([
					featureShown ? BLANK : feature.name,
					...(first
						? [sc.name, sc.tags.join(' '), sc.flaky ? 'Flaky' : sc.result]
						: [BLANK, BLANK, BLANK]),
					st ? i + 1 : BLANK,
					st?.keyword ?? BLANK,
					st?.text ?? BLANK,
					st?.status ?? BLANK,
					st?.durationMs ?? BLANK,
					st?.error ?? BLANK
				]);
				featureShown = true;
			});
		}
	}
	return rows;
}

module.exports = {
	buildTestCaseExport,
	testCaseCsv: (data) => toCsv(testCaseCsvRows(data)),
	buildReportExport,
	reportCsv: (data) => toCsv(reportCsvRows(data))
};
