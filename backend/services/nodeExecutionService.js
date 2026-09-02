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
const { DEFAULT_BROWSER, DEFAULT_FRAMEWORK, isFramework } = require('../constants/defaults');
const { JOB_STATUS } = require('../constants/jobStatus');
const { buildRunCommand } = require('../lib/runnerCommand');

const BACKEND_DIR = path.resolve(__dirname, '..');

// In-memory job store for active remote executions.
// Jobs are purged after 10 minutes post-completion.
const jobs = {};

const STALE_ARTIFACT_MS = 60 * 60 * 1000;

/**
 * Removes job artifacts a previous process left behind.
 *
 * Each finished job deletes its own report file on a 10-minute timer held in
 * memory, so restarting a node orphans whatever was still pending — and a report
 * file carries the run's recordings, so they are not small. Run once at node
 * startup; anything younger than an hour could belong to a job still in flight.
 */
function sweepStaleJobArtifacts() {
	const now = Date.now();
	const older = (p) => {
		try {
			return now - fs.statSync(p).mtimeMs > STALE_ARTIFACT_MS;
		} catch {
			return false;
		}
	};

	const tmp = path.resolve(os.tmpdir());
	let removed = 0;
	try {
		for (const name of fs.readdirSync(tmp)) {
			if (!/^plum-(report-.*\.json|ss-.*)$/.test(name)) continue;
			const full = path.join(tmp, name);
			if (!older(full)) continue;
			fs.rmSync(full, { recursive: true, force: true });
			removed++;
		}
	} catch {}

	const jobsRoot = path.join(BACKEND_DIR, '.plum-jobs');
	try {
		for (const name of fs.readdirSync(jobsRoot)) {
			const full = path.join(jobsRoot, name);
			if (!older(full)) continue;
			fs.rmSync(full, { recursive: true, force: true });
			removed++;
		}
	} catch {}

	if (removed > 0) console.log(`🧹 Removed ${removed} stale job artifact(s)`);
}

function getJob(jobId) {
	return jobs[jobId];
}

// Starts a remote test job dispatched from the primary server: materializes any
// uploaded test files, runs the project's own runner CLI in that folder, and
// tracks logs + rrweb batches for HTTP polling (see pollJob).
//
// `framework` comes from the primary, since a node holds no project state. An
// older primary sends none, so it falls back to the default.
function startJob({
	tags,
	browser = DEFAULT_BROWSER,
	workers = 1,
	framework,
	shard = null,
	tests = null,
	env: userEnv = {}
}) {
	const jobId = crypto.randomUUID();

	// path.resolve ensures absolute even if TMPDIR env var is set to a relative path
	const tmpdir = path.resolve(os.tmpdir());

	// Uploaded tests live *inside* the node's own tree, not in os.tmpdir(). A job dir
	// outside it has to reach the toolchain through NODE_PATH, and Playwright's
	// loader does not dedupe that against its own instance: the run dies with
	// "two different versions of @playwright/test" and finds no tests. Nested here,
	// ordinary upward resolution finds the node's node_modules, exactly as a
	// project under the primary's projects/ folder does.
	const jobsRoot = path.join(BACKEND_DIR, '.plum-jobs');

	// Write test files sent by the primary into a per-job temp dir
	let tempTestsDir = null;
	if (tests && Object.keys(tests).length > 0) {
		tempTestsDir = path.join(jobsRoot, `plum-job-${jobId}`);
		for (const [rel, content] of Object.entries(tests)) {
			const dest = path.join(tempTestsDir, rel);
			// Keep writes inside the job dir — `rel` comes off the wire.
			if (dest !== tempTestsDir && !dest.startsWith(tempTestsDir + path.sep)) {
				throw new Error(`Illegal test path: ${rel}`);
			}
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
		meta: { tags: tags || '', browser, workers, framework, shard },
		tempTestsDir,
		reportFile,
		ssDir
	};

	const jobFramework = isFramework(framework) ? framework : DEFAULT_FRAMEWORK;
	const cmd = buildRunCommand({
		framework: jobFramework,
		testsRoot: tempTestsDir ?? BACKEND_DIR,
		reportFile,
		tag: tags || '',
		browser,
		workers,
		// The primary owns retries: for Cucumber it re-dispatches, and for Playwright
		// it passes its own --retries on the lane that needs them.
		retries: 0,
		// Which slice of the selection this lane runs, when the primary sharded
		// rather than splitting by tag.
		shard
	});

	const env = {
		...process.env,
		// User/test vars (BASE_URL, IS_HEADLESS, custom secrets) forwarded from the
		// primary's own .env — nodes are stateless runners and shouldn't need their
		// own copy. Spread before the job-control vars below so a stray same-named
		// var in the user's .env can never override how this job actually runs.
		...userEnv,
		...cmd.env,
		TAG: tags || '',
		TRIGGER: TRIGGER_REMOTE,
		BROWSER: browser,
		REPORT_RUNNERS: String(workers),
		PLUM_SS_DIR: ssDir,
		...(tempTestsDir ? { TESTS_ROOT: tempTestsDir } : {})
	};

	const ssPoller = startRRwebPoller(ssDir, (batch) => {
		jobs[jobId].rrwebBatches.push(batch);
	});

	jobs[jobId].logs += `> ${cmd.bin} ${cmd.args.join(' ')}\n`;
	const proc = spawn('npx', [cmd.bin, ...cmd.args], { env, shell: true, cwd: cmd.cwd });
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

module.exports = {
	sweepStaleJobArtifacts,
	startJob,
	getJob,
	pollJob,
	cancelJob
};
