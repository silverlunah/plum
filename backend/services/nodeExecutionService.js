/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { startRRwebPoller } = require('../lib/rrwebPoller');
const { TRIGGER_REMOTE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { JOB_STATUS } = require('../constants/jobStatus');

const BACKEND_DIR = path.resolve(__dirname, '..');

// In-memory job store for active remote executions.
// Jobs are purged after 10 minutes post-completion.
const jobs = {};

function getJob(jobId) {
	return jobs[jobId];
}

// Starts a remote test job dispatched from the primary server: materializes
// any uploaded test files, spawns `npm run test`, and tracks logs + rrweb
// batches for HTTP polling (see pollJob).
function startJob({
	tags,
	browser = DEFAULT_BROWSER,
	workers = 1,
	tests = null,
	env: userEnv = {}
}) {
	const jobId = crypto.randomUUID();

	// path.resolve ensures absolute even if TMPDIR env var is set to a relative path
	const tmpdir = path.resolve(os.tmpdir());

	// Write test files sent by the primary into a per-job temp dir
	let tempTestsDir = null;
	if (tests && Object.keys(tests).length > 0) {
		tempTestsDir = path.join(tmpdir, `plum-job-${jobId}`);
		for (const [rel, content] of Object.entries(tests)) {
			const dest = path.join(tempTestsDir, rel);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, Buffer.from(content, 'base64'));
		}
	}

	// Each job writes to its own temp file so concurrent jobs on the same node
	// cannot clobber each other's reports (shared cucumber_report.json race condition).
	const reportFile = path.join(tmpdir, `plum-report-${jobId}.json`);
	const ssDir = path.join(tmpdir, `plum-ss-${jobId}`);
	fs.mkdirSync(ssDir, { recursive: true });

	jobs[jobId] = {
		status: JOB_STATUS.RUNNING,
		logs: '',
		// Both drained by pollJob — the primary has no socket back to this node.
		rrwebBatches: [],
		exitCode: null,
		startedAt: Date.now(),
		meta: { tags: tags || '', browser, workers },
		tempTestsDir,
		reportFile,
		ssDir
	};

	const env = {
		...process.env,
		// User/test vars (BASE_URL, IS_HEADLESS, custom secrets) forwarded from the
		// primary's own .env — nodes are stateless runners and shouldn't need their
		// own copy. Spread before the job-control vars below so a stray same-named
		// var in the user's .env can never override how this job actually runs.
		...userEnv,
		TAG: tags || '',
		TRIGGER: TRIGGER_REMOTE,
		BROWSER: browser,
		REPORT_RUNNERS: String(workers),
		CUCUMBER_REPORT_FILE: reportFile,
		PLUM_SS_DIR: ssDir,
		...(tempTestsDir ? { TESTS_ROOT: tempTestsDir } : {})
	};
	if (workers > 1) env.PARALLEL = String(workers);

	const ssPoller = startRRwebPoller(ssDir, (batch) => {
		jobs[jobId].rrwebBatches.push(batch);
	});

	const proc = spawn('npm', ['run', 'test'], { env, shell: true, cwd: BACKEND_DIR });
	jobs[jobId].proc = proc;
	proc.stdout.on('data', (d) => {
		jobs[jobId].logs += d.toString();
	});
	proc.stderr.on('data', (d) => {
		jobs[jobId].logs += d.toString();
	});
	proc.on('close', (code) => {
		ssPoller.stop();
		jobs[jobId].status = code === 0 ? JOB_STATUS.DONE : JOB_STATUS.ERROR;
		jobs[jobId].exitCode = code;

		try {
			if (fs.existsSync(reportFile)) {
				jobs[jobId].reportContent = fs.readFileSync(reportFile, 'utf8');
			}
		} catch {}

		fs.rm(ssDir, { recursive: true, force: true }, () => {});

		if (jobs[jobId].tempTestsDir) {
			fs.rm(jobs[jobId].tempTestsDir, { recursive: true, force: true }, () => {});
		}

		setTimeout(() => {
			try {
				fs.unlinkSync(reportFile);
			} catch {}
			delete jobs[jobId];
		}, 600_000);
	});

	return jobId;
}

// Drains and returns logs/rrweb batches since `offset`/`rrwebOffset` — used by
// the primary's HTTP polling loop (this node has no socket.io connection back).
function pollJob(jobId, offset, rrwebOffset = 0) {
	const job = jobs[jobId];
	if (!job) return null;
	return {
		status: job.status,
		logs: job.logs.slice(offset),
		rrwebBatches: job.rrwebBatches.slice(rrwebOffset),
		exitCode: job.exitCode
	};
}

// Primary server asks a node to stop a job when the user cancels a run. The
// proc's own close handler still runs and marks the job done/errored.
function cancelJob(jobId) {
	const job = jobs[jobId];
	if (!job) return false;
	try {
		job.proc?.kill('SIGTERM');
	} catch {}
	return true;
}

module.exports = { startJob, getJob, pollJob, cancelJob };
