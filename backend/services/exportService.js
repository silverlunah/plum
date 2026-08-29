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

async function buildTestCaseExport(scope, { suiteId, runId } = {}) {
	if (scope === 'run') {
		const run = await prisma.testRun.findUnique({
			where: { id: runId },
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

	const where = scope === 'suite' ? { id: suiteId } : {};
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

function testCaseCsvRows(data) {
	const rows = [TEST_CASE_CSV_HEADER];
	for (const suite of data.suites) {
		for (const c of suite.cases) {
			const base = [
				suite.displayId,
				suite.name,
				c.displayId,
				c.title,
				c.priority,
				yesNo(c.isAutomated)
			];
			const tail = [
				c.result ?? '',
				c.lastResult ?? '',
				c.lastTestedAt ? c.lastTestedAt.slice(0, 10) : '',
				c.lastTestedBy ?? '',
				c.notes ?? ''
			];
			if (c.steps.length === 0) {
				rows.push([...base, '', '', '', '', ...tail]);
				continue;
			}
			c.steps.forEach((step, i) => {
				rows.push([
					...base,
					i + 1,
					step.action,
					step.testData,
					step.expectedOutput,
					// The result/notes belong to the case, not a step — show them once
					// on the first step row so the block reads cleanly in a spreadsheet.
					...(i === 0 ? tail : ['', '', '', '', ''])
				]);
			});
		}
	}
	return rows;
}

// ── Reports ─────────────────────────────────────────────────────────────────

async function buildReportExport(id) {
	const reportService = require('./reportService');
	const detail = await reportService.getReportDetail(id);
	if (!detail) return null;

	let passed = 0;
	let failed = 0;
	let skipped = 0;
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
			steps += sc.steps.length;
			return {
				name: sc.name,
				tags: sc.tags,
				result: resultLabel(sc.status),
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
			totals: { scenarios: scenarioCount, passed, failed, skipped, steps }
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
		for (const sc of feature.scenarios) {
			const base = [feature.name, sc.name, sc.tags.join(' '), sc.result];
			if (sc.steps.length === 0) {
				rows.push([...base, '', '', '', '', '', '']);
				continue;
			}
			sc.steps.forEach((st, i) => {
				rows.push([
					...(i === 0 ? base : ['', '', '', '']),
					i + 1,
					st.keyword,
					st.text,
					st.status,
					st.durationMs,
					st.error
				]);
			});
		}
	}
	return rows;
}

// ── XLSX ────────────────────────────────────────────────────────────────────

const ExcelJS = require('exceljs');

// Excel caps sheet names at 31 chars and forbids : \ / ? * [ ].
function sheetName(name, used) {
	let base =
		String(name)
			.replace(/[:\\/?*[\]]/g, ' ')
			.trim()
			.slice(0, 31) || 'Sheet';
	let n = base;
	let i = 2;
	while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
	used.add(n.toLowerCase());
	return n;
}

function addTable(sheet, header, rows, widths) {
	sheet.addRow(header);
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	header.forEach((_, i) => {
		sheet.getColumn(i + 1).width = widths[i] ?? 18;
	});
	rows.forEach((r) => sheet.addRow(r));
}

const TC_SHEET_HEADER = [
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
const TC_SHEET_WIDTHS = [12, 40, 10, 11, 6, 40, 26, 40, 12, 12, 13, 16, 30];

function caseRows(c) {
	const tail = [
		c.result ?? '',
		c.lastResult ?? '',
		c.lastTestedAt ? c.lastTestedAt.slice(0, 10) : '',
		c.lastTestedBy ?? '',
		c.notes ?? ''
	];
	const head = [c.displayId, c.title, c.priority, yesNo(c.isAutomated)];
	if (c.steps.length === 0) return [[...head, '', '', '', '', ...tail]];
	return c.steps.map((step, i) => [
		...head,
		i + 1,
		step.action,
		step.testData,
		step.expectedOutput,
		...(i === 0 ? tail : ['', '', '', '', ''])
	]);
}

async function testCaseXlsx(data) {
	const wb = new ExcelJS.Workbook();
	const used = new Set();

	const overview = wb.addWorksheet(sheetName('Overview', used));
	addTable(
		overview,
		['Suite ID', 'Suite', 'Priority', 'Cases', 'Automated'],
		data.suites.map((s) => [
			s.displayId,
			s.name,
			s.priority,
			s.cases.length,
			s.cases.filter((c) => c.isAutomated).length
		]),
		[12, 40, 10, 8, 11]
	);

	for (const suite of data.suites) {
		const sheet = wb.addWorksheet(sheetName(suite.displayId, used));
		addTable(sheet, TC_SHEET_HEADER, suite.cases.flatMap(caseRows), TC_SHEET_WIDTHS);
	}

	return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = {
	buildTestCaseExport,
	testCaseCsv: (data) => toCsv(testCaseCsvRows(data)),
	testCaseXlsx,
	buildReportExport,
	reportCsv: (data) => toCsv(reportCsvRows(data))
};
