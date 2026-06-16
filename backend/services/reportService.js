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
function processCucumberJson(raw) {
	fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

	const features = raw.map((feature) => {
		const scenarios = (feature.elements || []).map((scenario) => {
			const visibleSteps = (scenario.steps || []).filter((s) => !s.hidden);
			const hookScreenshots = (scenario.steps || [])
				.filter((s) => s.hidden)
				.flatMap((step) => step.embeddings?.filter((e) => e.mime_type === 'image/png') ?? []);
			const failedStepIndex = visibleSteps.findLastIndex((s) => s.result?.status === 'failed');

			const steps = visibleSteps.map((step, index) => {
				const screenshotData =
					step.embeddings?.find((e) => e.mime_type === 'image/png')?.data ??
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

const getAllReports = () =>
	prisma.report.findMany({
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			status: true,
			tags: true,
			triggerType: true,
			runners: true,
			browser: true,
			runnerName: true,
			createdAt: true
		}
	});

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
			content: true
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
 * }} opts
 */
const saveReport = async ({
	rawCucumberJson,
	tags,
	triggerType,
	nodeCount,
	browser,
	runnerName,
	runnerId
}) => {
	const normTrigger = normaliseTrigger(triggerType);
	const { features, status } = processCucumberJson(rawCucumberJson);
	const cronJobId = await resolveCronJobId(normTrigger);

	return prisma.report.create({
		data: {
			status,
			tags: (tags ?? '').replace(/^\(|\)$/g, '') || '@all-tests',
			triggerType: normTrigger,
			runners: nodeCount ?? 1,
			browser: browser ?? 'chromium',
			runnerName: runnerName ?? null,
			runnerId: runnerId ?? null,
			cronJobId,
			content: { features }
		}
	});
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
 * }} opts
 */
const saveCombinedReport = async ({ reports, runners, overallCode, tag, triggerType, browser }) => {
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
			const key = feature.uri ?? feature.id ?? feature.name;
			if (featureMap.has(key)) {
				featureMap.get(key).elements.push(...(feature.elements ?? []));
			} else {
				featureMap.set(key, { ...feature, elements: [...(feature.elements ?? [])] });
			}
		}
	}
	const combined = [...featureMap.values()];

	return saveReport({
		rawCucumberJson: combined,
		tags: tag,
		triggerType,
		nodeCount: runners.length,
		browser,
		runnerName: runners.map((r) => r.name).join(', '),
		runnerId: null
	});
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

module.exports = {
	getAllReports,
	getLatestReportId,
	getReportDetail,
	saveReport,
	saveCombinedReport,
	deleteReport,
	deleteReports
};
