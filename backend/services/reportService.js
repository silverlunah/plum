/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const prisma = require('./prisma');
const { isScheduledTrigger, normaliseTrigger, TRIGGER_TYPE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { REPORT_STATUS } = require('../constants/jobStatus');

// Also declared in both scaffolds' recording code (_scaffold/*/utils/browser.ts and
// _scaffold/playwright/fixtures/plum.ts). Those files are copied into user projects
// and cannot import from the server, so the value is duplicated on purpose.
const RRWEB_MIME_TYPE = 'application/x-plum-rrweb+json';
// Small, always-attached marker (independent of whether any tab actually
// recorded events) so a scenario's worker is always recoverable for grouping,
// even on an instant-failure scenario with an empty recording.
const WORKER_META_MIME_TYPE = 'application/x-plum-worker+json';

// ---------------------------------------------------------------------------
// Auto-sync: mark test cases as automated and record history from Cucumber tags
// ---------------------------------------------------------------------------

async function syncAutomatedTags(projectId, reportId, features, testRunId = null) {
	try {
		const tagSet = new Set();
		for (const feature of features) {
			for (const scenario of feature.scenarios ?? []) {
				for (const tag of scenario.tags ?? []) {
					tagSet.add(tag.replace(/^@/, ''));
				}
			}
		}
		if (tagSet.size === 0) return;

		const matchingCases = await prisma.testCase.findMany({
			where: { projectId, displayId: { in: [...tagSet] } },
			select: { id: true, displayId: true }
		});
		if (matchingCases.length === 0) return;

		const tagToResult = new Map();
		for (const feature of features) {
			for (const scenario of feature.scenarios ?? []) {
				for (const tag of scenario.tags ?? []) {
					const t = tag.replace(/^@/, '');
					const result = scenario.status === 'passed' ? 'pass' : 'fail';
					if (!tagToResult.has(t) || result === 'fail') {
						tagToResult.set(t, result);
					}
				}
			}
		}

		await prisma.$transaction([
			...matchingCases.map((tc) =>
				prisma.testCase.update({ where: { id: tc.id }, data: { isAutomated: true } })
			),
			...matchingCases.map((tc) =>
				prisma.testCaseHistory.create({
					data: {
						caseId: tc.id,
						reportId,
						result: tagToResult.get(tc.displayId) ?? 'pass',
						source: 'automated'
					}
				})
			)
		]);

		if (testRunId) {
			const entries = await prisma.testRunEntry.findMany({
				where: { runId: testRunId, case: { displayId: { in: [...tagToResult.keys()] } } },
				select: { id: true, case: { select: { displayId: true } } }
			});
			if (entries.length > 0) {
				await prisma.$transaction([
					...entries.map((e) =>
						prisma.testRunEntry.update({
							where: { id: e.id },
							data: {
								status: tagToResult.get(e.case.displayId) ?? 'pass',
								executedAt: new Date()
							}
						})
					),
					prisma.testRun.updateMany({
						where: { id: testRunId, status: { in: ['backlog', 'draft'] } },
						data: { status: 'in-progress' }
					})
				]);
				// Push the new results to anyone on this run's execution page.
				require('./testRunService').emitRunChanged(testRunId, { reload: true });
			}
		}
	} catch (e) {
		console.error('[sync] Failed to sync automated tags:', e.message);
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveCronJobId(projectId, triggerType) {
	if (!isScheduledTrigger(triggerType)) return null;
	const job = await prisma.cronJob.findFirst({ where: { projectId, taskName: triggerType } });
	return job?.id ?? null;
}

// An MCP run through the CI trigger endpoint (or an old client) may carry no
// actor: attribute it to the org owner rather than leaving it blank.
async function resolveMcpActor(startedBy, triggerType) {
	if (startedBy || normaliseTrigger(triggerType) !== TRIGGER_TYPE.MCP) return startedBy || null;
	const owner = await prisma.user.findFirst({
		where: { role: 'owner' },
		orderBy: { createdAt: 'asc' },
		select: { name: true }
	});
	return owner?.name ?? null;
}

/**
 * Stable identity for a Cucumber feature across distributed lanes. Dispatched
 * runs report an absolute temp uri (…/plum-job-<uuid>/features/Login.feature)
 * that differs per runner; the suffix from `features/` onward is stable.
 */
function featureMergeKey(feature) {
	const uri = (feature.uri ?? '').replace(/\\/g, '/');
	const idx = uri.lastIndexOf('/features/');
	if (idx !== -1) return uri.slice(idx + 1);
	return uri || feature.id || feature.name;
}

// Mirrors frontend's isTestCaseTag (frontend/src/lib/utils/format.js), keep in
// sync so retry-attempt counts line up with how the report page groups scenarios.
function isTestCaseTag(tag) {
	return /^@test[\w-]*/i.test(tag) || /^@tc-?\d+/i.test(tag);
}

function scenarioIdTag(scenario) {
	return (scenario.tags ?? []).map((t) => t.name).find(isTestCaseTag) ?? null;
}

// Cucumber's legacy JSON `id` is identical for every Examples row of a Scenario
// Outline, `line` (the row's own line in the feature file) is the only field
// that actually differs between them, so combine the two for a truly unique key.
function scenarioUniqueId(scenario) {
	return `${scenario.id};;${scenario.line}`;
}

function scenarioFailed(scenario) {
	return (scenario.steps ?? []).some((s) => s.result?.status === 'failed');
}

/**
 * Reads the worker-id marker browser.ts attaches unconditionally in the After
 * hook (separate from rrweb recordings, which can legitimately be empty).
 */
function extractWorkerId(scenario) {
	const marker = (scenario.steps || [])
		.filter((s) => s.hidden)
		.flatMap(
			(step) => step.embeddings?.filter((e) => e.mime_type === WORKER_META_MIME_TYPE) ?? []
		)[0];
	if (!marker) return 1;
	try {
		const { workerId } = JSON.parse(Buffer.from(marker.data, 'base64').toString('utf8'));
		return Number.isFinite(workerId) ? workerId : 1;
	} catch {
		return 1;
	}
}

/**
 * Test-ID tags (see scenarioIdTag) of every failed scenario in a raw Cucumber
 * JSON payload, deduped. Used to scope the next retry attempt to just the
 * scenarios that need re-running.
 */
function getFailedIdTags(rawJson) {
	const tags = new Set();
	for (const feature of rawJson) {
		for (const scenario of feature.elements ?? []) {
			if (scenarioFailed(scenario)) {
				const idTag = scenarioIdTag(scenario);
				if (idTag) tags.add(idTag);
			}
		}
	}
	return [...tags];
}

/**
 * Folds one retry attempt's raw Cucumber JSON into the accumulated result,
 * replacing each retried scenario's prior-round entry with this round's
 * outcome (matched by Cucumber's own stable scenario id). Mutates
 * `attemptsMap` in place, recording the highest round number each scenario
 * appeared in: that number *is* its total attempt count, since a scenario
 * only reappears in a later round if it failed every round before it.
 */
function mergeRawAttempt(accumulated, attemptRawJson, round, attemptsMap) {
	for (const feature of attemptRawJson) {
		const key = featureMergeKey(feature);
		let accFeature = accumulated.find((f) => featureMergeKey(f) === key);
		if (!accFeature) {
			accFeature = { ...feature, elements: [] };
			accumulated.push(accFeature);
		}
		for (const scenario of feature.elements ?? []) {
			accFeature.elements = accFeature.elements.filter(
				(e) => scenarioUniqueId(e) !== scenarioUniqueId(scenario)
			);
			accFeature.elements.push(scenario);
			const idTag = scenarioIdTag(scenario);
			if (idTag) attemptsMap[idTag] = round;
		}
	}
	return accumulated;
}

/**
 * Parses one scenario's hidden hook-step rrweb attachments (flushed from
 * browser.ts's flushRecordings via the After hook) into Recording rows ready
 * for prisma.recording.createMany, keyed to this scenario via scenarioUniqueId.
 */
function extractRecordings(scenario) {
	const hookRecordings = (scenario.steps || [])
		.filter((s) => s.hidden)
		.flatMap((step) => step.embeddings?.filter((e) => e.mime_type === RRWEB_MIME_TYPE) ?? []);

	return hookRecordings
		.map((embedding) => {
			try {
				const decompressed = zlib.gunzipSync(Buffer.from(embedding.data, 'base64'));
				const { workerId, tabId, tabIndex, events, openedAt, closedAt } = JSON.parse(
					decompressed.toString('utf8')
				);
				return {
					scenarioId: scenarioUniqueId(scenario),
					workerId,
					tabId,
					tabIndex,
					// Real Playwright open/close times (browser.ts), not inferred from the
					// events themselves: a static page can go quiet, or emit nothing at
					// all, long before it actually closes, which made the last-event
					// timestamp an unreliable stand-in for how long a tab stayed relevant.
					startedAt: BigInt(openedAt ?? events[0]?.timestamp ?? 0),
					endedAt: BigInt(closedAt ?? events[events.length - 1]?.timestamp ?? 0),
					events: zlib.gzipSync(Buffer.from(JSON.stringify(events), 'utf8'))
				};
			} catch (e) {
				console.error(`[report] Failed to parse rrweb recording: ${e.message}`);
				return null;
			}
		})
		.filter(Boolean);
}

/**
 * Transforms raw Cucumber JSON into our stored format:
 * - Resolves pass/fail status per step/scenario/feature
 * - Extracts rrweb recordings attached via the After hook
 *
 * Returns { features, status, recordings } where status is 'PASS' | 'FAIL'.
 */
function processCucumberJson(raw, attempts = {}) {
	const recordings = [];

	const features = raw.map((feature) => {
		const scenarios = (feature.elements || []).map((scenario) => {
			recordings.push(...extractRecordings(scenario));

			const visibleSteps = (scenario.steps || []).filter((s) => !s.hidden);

			const steps = visibleSteps.map((step) => {
				const rawStatus = step.result?.status ?? 'pending';
				// Undefined/ambiguous steps rank below 'failed' otherwise, so a step
				// definition mismatch reports as passing instead of failing.
				const status =
					rawStatus === 'undefined' || rawStatus === 'ambiguous' ? 'failed' : rawStatus;

				return {
					keyword: step.keyword.trim(),
					name: step.name ?? '',
					status,
					duration: Math.round((step.result?.duration ?? 0) / 1_000_000),
					error: step.result?.error_message ?? null,
					dataTable: step.arguments?.[0]?.rows?.map((row) => row.cells) ?? null
				};
			});

			const worstStatus = steps.reduce((acc, s) => {
				const rank = { failed: 3, pending: 2, skipped: 1, passed: 0 };
				return (rank[s.status] ?? 0) > (rank[acc] ?? 0) ? s.status : acc;
			}, 'passed');

			const scenarioAttempts = attempts[scenarioIdTag(scenario)] ?? 1;

			return {
				id: scenarioUniqueId(scenario),
				name: scenario.name,
				keyword: scenario.keyword,
				tags: (scenario.tags ?? []).map((t) => t.name),
				status: worstStatus,
				duration: steps.reduce((s, st) => s + st.duration, 0),
				attempts: scenarioAttempts,
				// Failed at least once, then passed: flaky. A scenario that never
				// passed is just failed, not flaky.
				flaky: worstStatus === 'passed' && scenarioAttempts > 1,
				workerId: extractWorkerId(scenario),
				runnerName: scenario.__plumRunnerName ?? null,
				steps
			};
		});

		return {
			name: feature.name,
			uri: feature.uri,
			status: scenarios.some((s) => s.status === 'failed') ? 'failed' : 'passed',
			scenarios
		};
	});

	const hasFailures = features.some((f) => f.status === 'failed');
	// A run that executed nothing is not a pass. Cucumber and Playwright both exit
	// 0 when a tag or grep matches no tests, so without this a typo in a tag, or
	// pointing a run at a project whose tests the runner cannot see, reports green
	// having verified nothing.
	const ranNothing = features.every((f) => (f.scenarios ?? []).length === 0);
	const flakyCount = features.reduce((n, f) => n + f.scenarios.filter((s) => s.flaky).length, 0);
	return {
		features,
		recordings,
		status: hasFailures || ranNothing ? REPORT_STATUS.FAIL : REPORT_STATUS.PASS,
		flakyCount
	};
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

const reportListSelect = {
	id: true,
	status: true,
	tags: true,
	triggerType: true,
	viaMcp: true,
	startedBy: true,
	runnerCount: true,
	workerCount: true,
	flakyCount: true,
	browser: true,
	framework: true,
	runnerName: true,
	createdAt: true,
	testRun: { select: { id: true, title: true } }
};

const TREND_SIZE = 12;

const getReports = async (projectId, { page = 1, limit = 15 } = {}) => {
	const skip = (page - 1) * limit;
	const [reports, total, passCount, trend] = await Promise.all([
		prisma.report.findMany({
			where: { projectId },
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit,
			select: reportListSelect
		}),
		prisma.report.count({ where: { projectId } }),
		prisma.report.count({ where: { projectId, status: REPORT_STATUS.PASS } }),
		prisma.report.findMany({
			where: { projectId },
			orderBy: { createdAt: 'desc' },
			take: TREND_SIZE,
			select: { id: true, status: true, tags: true, createdAt: true }
		})
	]);
	return { reports, total, passCount, failCount: total - passCount, trend };
};

const getLatestReportId = async (projectId) => {
	const report = await prisma.report.findFirst({
		where: { projectId },
		orderBy: { createdAt: 'desc' },
		select: { id: true }
	});
	return report?.id ?? null;
};

const getReportDetail = async (projectId, id) => {
	const report = await prisma.report.findFirst({
		where: { id, projectId },
		select: {
			id: true,
			status: true,
			tags: true,
			triggerType: true,
			viaMcp: true,
			startedBy: true,
			runnerCount: true,
			workerCount: true,
			flakyCount: true,
			browser: true,
			framework: true,
			runnerName: true,
			createdAt: true,
			content: true,
			logs: true,
			duration: true,
			testRun: { select: { id: true, title: true } }
		}
	});
	if (!report) return null;
	const { content, ...meta } = report;
	return { ...meta, features: content?.features ?? [] };
};

/**
 * Metadata for every recording on a report: deliberately excludes `events`
 * (can be large) so the replay UI can work out tab timing/order before
 * fetching any actual event data.
 */
const getRecordings = async (projectId, reportId) => {
	const owned = await prisma.report.findFirst({
		where: { id: reportId, projectId },
		select: { id: true }
	});
	if (!owned) return [];
	const recordings = await prisma.recording.findMany({
		where: { reportId },
		select: {
			id: true,
			scenarioId: true,
			workerId: true,
			tabId: true,
			tabIndex: true,
			startedAt: true,
			endedAt: true
		},
		orderBy: { tabIndex: 'asc' }
	});
	// BigInt doesn't survive JSON.stringify: both fit safely in a JS Number
	// (epoch ms is well under Number.MAX_SAFE_INTEGER).
	return recordings.map((r) => ({
		...r,
		startedAt: r.startedAt === null ? null : Number(r.startedAt),
		endedAt: r.endedAt === null ? null : Number(r.endedAt)
	}));
};

/**
 * Decompresses one recording's rrweb event array, fetched lazily by the
 * replay UI only once a tab is actually selected for playback.
 */
const getRecordingEvents = async (projectId, recordingId) => {
	const recording = await prisma.recording.findFirst({
		where: { id: recordingId, report: { projectId } },
		select: { events: true }
	});
	if (!recording) return null;
	return JSON.parse(zlib.gunzipSync(recording.events).toString('utf8'));
};

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Processes raw Cucumber JSON and persists the full report to the database.
 *
 * @param {{
 *   rawCucumberJson: object[],
 *   tags: string,
 *   triggerType: string,
 *   runnerCount?: number,
 *   workerCount?: number,
 *   browser?: string,
 *   runnerName?: string,
 *   runnerId?: string,
 *   testRunId?: string,
 * }} opts
 */
const saveReport = async ({
	projectId,
	rawCucumberJson,
	tags,
	triggerType,
	startedBy = null,
	runnerCount = 1,
	workerCount = 1,
	browser,
	runnerName,
	runnerId,
	testRunId,
	forceFail = false,
	logs = null,
	duration = null,
	attempts = {}
}) => {
	const normTrigger = normaliseTrigger(triggerType);
	const {
		features,
		recordings,
		status: derivedStatus,
		flakyCount
	} = processCucumberJson(rawCucumberJson, attempts);
	const status = forceFail ? REPORT_STATUS.FAIL : derivedStatus;
	const cronJobId = await resolveCronJobId(projectId, normTrigger);
	const actor = await resolveMcpActor(startedBy, normTrigger);
	// Recorded from the project rather than passed in, so no caller can persist a
	// report whose stored shape disagrees with the parser that produced it.
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { framework: true }
	});

	const report = await prisma.report.create({
		data: {
			projectId,
			status,
			tags: (tags ?? '').replace(/^\(|\)$/g, '') || '@all-tests',
			triggerType: normTrigger,
			viaMcp: normTrigger === TRIGGER_TYPE.MCP,
			startedBy: actor,
			runnerCount,
			workerCount,
			flakyCount,
			browser: browser ?? DEFAULT_BROWSER,
			framework: project.framework,
			runnerName: runnerName ?? null,
			runnerId: runnerId ?? null,
			cronJobId,
			testRunId: testRunId ?? null,
			content: { features },
			logs: logs || null,
			duration
		}
	});
	if (recordings.length > 0) {
		await prisma.recording.createMany({
			data: recordings.map((r) => ({ ...r, reportId: report.id }))
		});
	}
	syncAutomatedTags(projectId, report.id, features, testRunId ?? null);
	return report;
};

/**
 * Merges Cucumber JSON from all distributed lanes and persists one combined
 * report to the database.
 *
 * @param {{
 *   reports: (string|null)[],
 *   runners: { id: string, name: string, dbId: string|null }[],
 *   workers?: number,
 *   overallCode: number,
 *   tag: string,
 *   triggerType: string,
 *   browser: string,
 *   duration: number,
 * }} opts
 */
const saveCombinedReport = async ({
	projectId,
	reports,
	runners,
	workers = 1,
	overallCode,
	tag,
	triggerType,
	startedBy = null,
	browser,
	testRunId,
	laneLogs = null,
	duration = null,
	attemptsByLane = null
}) => {
	const featureMap = new Map();
	reports.forEach((content, laneIdx) => {
		if (!content) return;
		let parsed;
		try {
			parsed = JSON.parse(content);
		} catch {
			return;
		}
		const lane = runners[laneIdx];
		for (const feature of parsed) {
			// Merging loses which lane a scenario came from: the raw Cucumber JSON
			// has no such field: so stamp it here, before the merge, while we still
			// know. processCucumberJson reads this to group the report's scenario
			// list by runner.
			for (const scenario of feature.elements ?? []) {
				scenario.__plumRunnerName = lane?.name ?? null;
			}
			// Each lane runs from its own temp dir, so the same feature reports a
			// different absolute uri per runner. Key on the path from `features/`
			// onward (falling back to name) so one feature's scenarios from every
			// lane merge into a single entry instead of one duplicate per runner.
			const key = featureMergeKey(feature);
			if (featureMap.has(key)) {
				featureMap.get(key).elements.push(...(feature.elements ?? []));
			} else {
				featureMap.set(key, { ...feature, elements: [...(feature.elements ?? [])] });
			}
		}
	});
	const combined = [...featureMap.values()];

	let combinedLogs = null;
	if (laneLogs) {
		const parts = runners
			.map((r) => (laneLogs[r.id] ? `=== ${r.name} ===\n${laneLogs[r.id]}` : null))
			.filter(Boolean);
		if (parts.length > 0) combinedLogs = parts.join('\n\n');
	}

	// Chunked lanes run disjoint sets of tests, so their attempt maps never
	// collide: a plain merge is safe.
	const attempts = attemptsByLane ? Object.assign({}, ...attemptsByLane.filter(Boolean)) : {};

	return saveReport({
		projectId,
		rawCucumberJson: combined,
		tags: tag,
		triggerType,
		startedBy,
		runnerCount: runners.length,
		workerCount: workers,
		browser,
		runnerName: runners.map((r) => r.name).join(', '),
		runnerId: null,
		testRunId: testRunId ?? null,
		forceFail: reports.some((r) => r === null),
		logs: combinedLogs,
		duration,
		attempts
	});
};

// Finds the report a no-retry run just produced (the most recent one created
// after the run started) and patches in its wall-clock duration.
const attachDurationToLatestReport = async ({ projectId, afterTimestamp, duration }) => {
	const report = await prisma.report.findFirst({
		where: { projectId, createdAt: { gte: new Date(afterTimestamp) } },
		orderBy: { createdAt: 'desc' },
		select: { id: true, status: true }
	});
	if (!report) return null;
	await prisma.report.update({ where: { id: report.id }, data: { duration } });
	return report;
};

// ---------------------------------------------------------------------------
// Delete operations
// ---------------------------------------------------------------------------

const deleteReport = async (projectId, id) => {
	await prisma.report.deleteMany({ where: { id, projectId } });
};

const deleteReports = async (projectId, ids) => {
	await prisma.report.deleteMany({ where: { id: { in: ids }, projectId } });
};

// Instance-wide nightly prune. Recordings cascade-delete with their report;
// TestCaseHistory.reportId is SetNull so the manual-run history it holds survives.
const pruneOldReports = async (retentionDays) => {
	const days = Number(retentionDays);
	if (!Number.isFinite(days) || days <= 0) return { count: 0 };
	const cutoff = new Date(Date.now() - days * 86_400_000);
	return prisma.report.deleteMany({ where: { createdAt: { lt: cutoff } } });
};

/**
 * Marks a repository case automated when a test in the project carries its id as a
 * tag. Reads the project's discovered tests rather than scanning .feature text: a
 * Playwright project has no features/ directory, so the old scan returned early and
 * no case in such a project was ever marked automated.
 */
async function syncAutomatedFromTests(projectId) {
	try {
		const tagSet = await require('./testService').getTestIds(projectId);
		if (tagSet.size === 0) return;
		await prisma.testCase.updateMany({
			where: { projectId, displayId: { in: [...tagSet] }, isAutomated: false },
			data: { isAutomated: true }
		});
	} catch (e) {
		console.error('[sync] syncAutomatedFromTests failed:', e.message);
	}
}

module.exports = {
	getReports,
	getLatestReportId,
	getReportDetail,
	getRecordings,
	getRecordingEvents,
	saveReport,
	saveCombinedReport,
	attachDurationToLatestReport,
	syncAutomatedFromTests,
	deleteReport,
	deleteReports,
	pruneOldReports,
	getFailedIdTags,
	mergeRawAttempt
};
