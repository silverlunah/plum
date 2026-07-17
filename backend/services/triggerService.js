/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { startSsPoller } = require('../lib/screenshotPoller');
const { TRIGGER_TYPE } = require('../constants/triggers');
const { readCucumberReportFile } = require('../lib/reportFilename');
const { runWithRetries } = require('../lib/retryRunner');
const settingsService = require('./settingsService');
const reportService = require('./reportService');

const BACKEND_DIR = path.resolve(__dirname, '..');
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory job store: jobId → { status, exitCode, reportId, startedAt }
const jobs = new Map();

let _io = null;
function setSocketIO(io) {
	_io = io;
}

function pruneOldJobs() {
	const cutoff = Date.now() - JOB_TTL_MS;
	for (const [id, job] of jobs) {
		if (job.startedAt < cutoff) jobs.delete(id);
	}
}

function getJob(jobId) {
	return jobs.get(jobId);
}

function runAttempt({
	jobId,
	tag,
	browser,
	workers,
	trigger,
	testRunId,
	baseUrl,
	suppressSave,
	onLog,
	onScreenshot
}) {
	return new Promise((resolve) => {
		const ssDir = path.join(os.tmpdir(), `plum-trigger-ss-${jobId}-${Date.now()}`);
		fs.mkdirSync(ssDir, { recursive: true });

		const env = {
			...process.env,
			TAG: tag,
			TRIGGER: trigger,
			BROWSER: browser,
			REPORT_RUNNERS: String(workers),
			PLUM_SS_DIR: ssDir
		};
		if (Number(workers) > 1) env.PARALLEL = String(workers);
		if (testRunId) env.TEST_RUN_ID = testRunId;
		if (baseUrl) env.BASE_URL = baseUrl;
		if (suppressSave) env.PLUM_MODE = 'node';

		const proc = spawn('npm', ['run', 'test'], { env, shell: true, cwd: BACKEND_DIR });

		const ssPoller = startSsPoller(ssDir, onScreenshot);

		proc.stdout.on('data', (d) => onLog(d.toString()));
		proc.stderr.on('data', (d) => onLog(`[ERROR] ${d.toString()}`));

		proc.on('close', (code) => {
			clearInterval(ssPoller);
			fs.rm(ssDir, { recursive: true, force: true }, () => {});
			resolve({ code, raw: suppressSave ? readCucumberReportFile() : null });
		});
	});
}

function runNoRetry({
	jobId,
	tag,
	browser,
	workers,
	trigger,
	testRunId,
	baseUrl,
	startedAt,
	onLog,
	onScreenshot
}) {
	runAttempt({
		jobId,
		tag,
		browser,
		workers,
		trigger,
		testRunId,
		baseUrl,
		suppressSave: false,
		onLog,
		onScreenshot
	}).then(async ({ code }) => {
		let reportId = null;
		try {
			const report = await reportService.attachDurationToLatestReport({
				afterTimestamp: startedAt,
				duration: Date.now() - startedAt
			});
			reportId = report?.id ?? null;
			jobs.set(jobId, {
				status: code === 130 ? 'cancelled' : 'done',
				exitCode: code,
				reportId,
				startedAt
			});
		} catch {
			jobs.set(jobId, { status: 'done', exitCode: code, reportId: null, startedAt });
		}
		if (_io) _io.emit('bg-run-done', { runId: jobId, code, reportId });
	});
}

function runWithRetriesAndSave({
	jobId,
	tag,
	browser,
	workers,
	trigger,
	testRunId,
	baseUrl,
	maxRetries,
	startedAt,
	onLog,
	onScreenshot
}) {
	runWithRetries({
		maxRetries,
		spawnAttempt: async (tagOverride) => {
			const { code, raw } = await runAttempt({
				jobId,
				tag: tagOverride ?? tag,
				browser,
				workers,
				trigger,
				testRunId,
				baseUrl,
				suppressSave: true,
				onLog,
				onScreenshot
			});
			return { code, rawJson: raw ? JSON.parse(raw) : [] };
		},
		onLog
	}).then(async ({ code, rawJson, attempts }) => {
		let reportId = null;
		try {
			const report = await reportService.saveReport({
				rawCucumberJson: rawJson,
				tags: tag,
				triggerType: trigger,
				browser,
				testRunId: testRunId ?? null,
				duration: Date.now() - startedAt,
				attempts
			});
			reportId = report.id;
			jobs.set(jobId, {
				status: code === 130 ? 'cancelled' : 'done',
				exitCode: code,
				reportId,
				startedAt
			});
		} catch {
			jobs.set(jobId, { status: 'done', exitCode: code, reportId: null, startedAt });
		}
		if (_io) _io.emit('bg-run-done', { runId: jobId, code, reportId });
	});
}

// Starts a background test run for the HTTP trigger API and returns the jobId
// immediately — the run continues asynchronously, reporting progress via
// socket.io events (bg-run-start/log/screenshot/done) and the job store
// (polled through getJob).
async function startRun({
	tag = '',
	browser = 'chromium',
	workers = 1,
	baseUrl,
	testRunId,
	trigger
}) {
	pruneOldJobs();
	const { maxRetries } = await settingsService.getProject();

	const jobId = randomUUID();
	const startedAt = Date.now();
	jobs.set(jobId, { status: 'running', exitCode: null, reportId: null, startedAt });

	if (_io) {
		_io.emit('bg-run-start', {
			runId: jobId,
			kind: trigger,
			label: trigger === TRIGGER_TYPE.MCP ? 'MCP run' : 'External run',
			meta: { tag, browser, workers }
		});
	}

	const onLog = (text) => {
		if (_io) _io.emit('bg-run-log', { runId: jobId, log: text });
	};
	const onScreenshot = ({ stepName, data }) => {
		if (_io) _io.emit('bg-run-screenshot', { runId: jobId, stepName, data });
	};

	const runParams = {
		jobId,
		tag,
		browser,
		workers,
		trigger,
		testRunId,
		baseUrl,
		startedAt,
		onLog,
		onScreenshot
	};
	if (maxRetries === 0) {
		runNoRetry(runParams);
	} else {
		runWithRetriesAndSave({ ...runParams, maxRetries });
	}

	return jobId;
}

module.exports = { setSocketIO, startRun, getJob };
