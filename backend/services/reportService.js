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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('./prisma');
const { isScheduledTrigger, normaliseTrigger } = require('../constants/triggers');
const { SCREENSHOTS_DIR } = require('../lib/reportFilename');

// ---------------------------------------------------------------------------
// Auto-sync: mark test cases as automated and record history from Cucumber tags
// ---------------------------------------------------------------------------

async function syncAutomatedTags(reportId, features, testRunId = null) {
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
			where: { displayId: { in: [...tagSet] } },
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
			}
		}
	} catch (e) {
		console.error('[sync] Failed to sync automated tags:', e.message);
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveCronJobId(triggerType) {
	if (!isScheduledTrigger(triggerType)) return null;
	const job = await prisma.cronJob.findUnique({ where: { taskName: triggerType } });
	return job?.id ?? null;
}

/**
 * Walks a screenshot filename out of the content JSON tree.
 * Used when deleting reports to clean up screenshot files.
 */
function collectScreenshotFiles(content) {
	const files = [];
	for (const feature of content?.features ?? []) {
		for (const scenario of feature?.scenarios ?? []) {
			for (const step of scenario?.steps ?? []) {
				if (step.screenshot) files.push(step.screenshot);
			}
		}
	}
	return files;
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

// Mirrors frontend's isTestCaseTag (frontend/src/lib/utils/format.js) — keep in
// sync so retry-attempt counts line up with how the report page groups scenarios.
function isTestCaseTag(tag) {
	return /^@test[\w-]*/i.test(tag) || /^@tc-?\d+/i.test(tag);
}

function scenarioIdTag(scenario) {
	return (scenario.tags ?? []).map((t) => t.name).find(isTestCaseTag) ?? null;
}

function scenarioFailed(scenario) {
	return (scenario.steps ?? []).some((s) => s.result?.status === 'failed');
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
 * appeared in — that number *is* its total attempt count, since a scenario
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
			accFeature.elements = accFeature.elements.filter((e) => e.id !== scenario.id);
			accFeature.elements.push(scenario);
			const idTag = scenarioIdTag(scenario);
			if (idTag) attemptsMap[idTag] = round;
		}
	}
	return accumulated;
}

function deleteScreenshotFiles(content) {
	for (const file of collectScreenshotFiles(content)) {
		const p = path.join(SCREENSHOTS_DIR, file);
		try {
			if (fs.existsSync(p)) fs.unlinkSync(p);
		} catch {}
	}
}

/**
 * Transforms raw Cucumber JSON into our stored format:
 * - Resolves pass/fail status per step/scenario/feature
 * - Extracts base64 screenshots to PNG files on disk
 * - Stores only the filename in the content (not the base64 blob)
 *
 * Returns { features, status } where status is 'PASS' | 'FAIL'.
 */
function processCucumberJson(raw, attempts = {}) {
	fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

	const features = raw.map((feature) => {
		const scenarios = (feature.elements || []).map((scenario) => {
			const visibleSteps = (scenario.steps || []).filter((s) => !s.hidden);
			const hookScreenshots = (scenario.steps || [])
				.filter((s) => s.hidden)
				.flatMap((step) => step.embeddings?.filter((e) => e.mime_type === 'image/png') ?? []);
			const failedStepIndex = visibleSteps.findLastIndex((s) => s.result?.status === 'failed');

			const steps = visibleSteps.map((step, index) => {
				// AfterStep hook attachments land in step.after[].embeddings in Cucumber.js JSON
				const afterStepScreenshot =
					(step.after ?? []).flatMap(
						(a) => a.embeddings?.filter((e) => e.mime_type === 'image/png') ?? []
					)[0]?.data ?? null;

				const screenshotData =
					step.embeddings?.find((e) => e.mime_type === 'image/png')?.data ??
					afterStepScreenshot ??
					(index === failedStepIndex ? hookScreenshots[0]?.data : null) ??
					null;

				let screenshotFile = null;
				if (screenshotData) {
					screenshotFile = `${crypto.randomUUID()}.png`;
					try {
						fs.writeFileSync(
							path.join(SCREENSHOTS_DIR, screenshotFile),
							Buffer.from(screenshotData, 'base64')
						);
					} catch (e) {
						console.error(`[report] Failed to write screenshot: ${e.message}`);
						screenshotFile = null;
					}
				}

				return {
					keyword: step.keyword.trim(),
					name: step.name ?? '',
					status: step.result?.status ?? 'pending',
					duration: Math.round((step.result?.duration ?? 0) / 1_000_000),
					error: step.result?.error_message ?? null,
					screenshot: screenshotFile
				};
			});

			const worstStatus = steps.reduce((acc, s) => {
				const rank = { failed: 3, pending: 2, skipped: 1, passed: 0 };
				return (rank[s.status] ?? 0) > (rank[acc] ?? 0) ? s.status : acc;
			}, 'passed');

			return {
				name: scenario.name,
				keyword: scenario.keyword,
				tags: (scenario.tags ?? []).map((t) => t.name),
				status: worstStatus,
				duration: steps.reduce((s, st) => s + st.duration, 0),
				attempts: attempts[scenarioIdTag(scenario)] ?? 1,
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
	return { features, status: hasFailures ? 'FAIL' : 'PASS' };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

const reportListSelect = {
	id: true,
	status: true,
	tags: true,
	triggerType: true,
	runners: true,
	browser: true,
	runnerName: true,
	createdAt: true,
	testRun: { select: { id: true, title: true } }
};

const TREND_SIZE = 12;

const getReports = async ({ page = 1, limit = 15 } = {}) => {
	const skip = (page - 1) * limit;
	const [reports, total, passCount, trend] = await Promise.all([
		prisma.report.findMany({
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit,
			select: reportListSelect
		}),
		prisma.report.count(),
		prisma.report.count({ where: { status: 'PASS' } }),
		prisma.report.findMany({
			orderBy: { createdAt: 'desc' },
			take: TREND_SIZE,
			select: { id: true, status: true, tags: true, createdAt: true }
		})
	]);
	return { reports, total, passCount, failCount: total - passCount, trend };
};

const getLatestReportId = async () => {
	const report = await prisma.report.findFirst({
		orderBy: { createdAt: 'desc' },
		select: { id: true }
	});
	return report?.id ?? null;
};

const getReportDetail = async (id) => {
	const report = await prisma.report.findUnique({
		where: { id },
		select: {
			id: true,
			status: true,
			tags: true,
			triggerType: true,
			runners: true,
			browser: true,
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
 *   nodeCount?: number,
 *   browser?: string,
 *   runnerName?: string,
 *   runnerId?: string,
 *   testRunId?: string,
 * }} opts
 */
const saveReport = async ({
	rawCucumberJson,
	tags,
	triggerType,
	nodeCount,
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
	const { features, status: derivedStatus } = processCucumberJson(rawCucumberJson, attempts);
	const status = forceFail ? 'FAIL' : derivedStatus;
	const cronJobId = await resolveCronJobId(normTrigger);

	const report = await prisma.report.create({
		data: {
			status,
			tags: (tags ?? '').replace(/^\(|\)$/g, '') || '@all-tests',
			triggerType: normTrigger,
			runners: nodeCount ?? 1,
			browser: browser ?? 'chromium',
			runnerName: runnerName ?? null,
			runnerId: runnerId ?? null,
			cronJobId,
			testRunId: testRunId ?? null,
			content: { features },
			logs: logs || null,
			duration
		}
	});
	syncAutomatedTags(report.id, features, testRunId ?? null);
	return report;
};

/**
 * Merges Cucumber JSON from all distributed lanes, processes screenshots,
 * and persists one combined report to the database.
 *
 * @param {{
 *   reports: (string|null)[],
 *   runners: { id: string, name: string, dbId: string|null }[],
 *   overallCode: number,
 *   tag: string,
 *   triggerType: string,
 *   browser: string,
 *   duration: number,
 * }} opts
 */
const saveCombinedReport = async ({
	reports,
	runners,
	overallCode,
	tag,
	triggerType,
	browser,
	testRunId,
	laneLogs = null,
	duration = null,
	attemptsByLane = null
}) => {
	const featureMap = new Map();
	for (const content of reports) {
		if (!content) continue;
		let parsed;
		try {
			parsed = JSON.parse(content);
		} catch {
			continue;
		}
		for (const feature of parsed) {
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
	}
	const combined = [...featureMap.values()];

	let combinedLogs = null;
	if (laneLogs) {
		const parts = runners
			.map((r) => (laneLogs[r.id] ? `=== ${r.name} ===\n${laneLogs[r.id]}` : null))
			.filter(Boolean);
		if (parts.length > 0) combinedLogs = parts.join('\n\n');
	}

	// Chunked lanes run disjoint sets of tests, so their attempt maps never
	// collide — a plain merge is safe.
	const attempts = attemptsByLane ? Object.assign({}, ...attemptsByLane.filter(Boolean)) : {};

	return saveReport({
		rawCucumberJson: combined,
		tags: tag,
		triggerType,
		nodeCount: runners.length,
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
const attachDurationToLatestReport = async ({ afterTimestamp, duration }) => {
	const report = await prisma.report.findFirst({
		where: { createdAt: { gte: new Date(afterTimestamp) } },
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

const deleteReport = async (id) => {
	const report = await prisma.report.findUnique({ where: { id }, select: { content: true } });
	if (report) deleteScreenshotFiles(report.content);
	await prisma.report.delete({ where: { id } });
};

const deleteReports = async (ids) => {
	const reports = await prisma.report.findMany({
		where: { id: { in: ids } },
		select: { content: true }
	});
	for (const r of reports) deleteScreenshotFiles(r.content);
	await prisma.report.deleteMany({ where: { id: { in: ids } } });
};

const FEATURES_DIR = path.join(__dirname, '../tests/features');

async function syncAutomatedFromFeatures() {
	try {
		if (!fs.existsSync(FEATURES_DIR)) return;
		const tagSet = new Set();
		for (const file of fs.readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.feature'))) {
			const content = fs.readFileSync(path.join(FEATURES_DIR, file), 'utf8');
			for (const m of content.matchAll(/@(\S+)/g)) tagSet.add(m[1]);
		}
		if (tagSet.size === 0) return;
		await prisma.testCase.updateMany({
			where: { displayId: { in: [...tagSet] }, isAutomated: false },
			data: { isAutomated: true }
		});
	} catch (e) {
		console.error('[sync] syncAutomatedFromFeatures failed:', e.message);
	}
}

module.exports = {
	getReports,
	getLatestReportId,
	getReportDetail,
	saveReport,
	saveCombinedReport,
	attachDurationToLatestReport,
	syncAutomatedFromFeatures,
	deleteReport,
	deleteReports,
	getFailedIdTags,
	mergeRawAttempt
};
