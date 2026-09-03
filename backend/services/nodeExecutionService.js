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
const { DEFAULT_BROWSER, FRAMEWORK, isFramework } = require('../constants/defaults');
const { JOB_STATUS } = require('../constants/jobStatus');
const { buildRunCommand, describeCommand } = require('../lib/runnerCommand');

const BACKEND_DIR = path.resolve(__dirname, '..');

// In-memory job store for active remote executions.
// Jobs are purged after 10 minutes post-completion.
const jobs = {};

// Only this process's own leftovers are swept, and only from a previous run of it:
// two nodes on one host share os.tmpdir(), and a suite can legitimately run for
// hours, so matching every plum-* artifact could delete a live run's files.
const ARTIFACT_PREFIX = `plum-${process.env.RUNNER_ID || 'node'}-`;

// Job payloads live under ~/.plum, not in the installed package: a global install is
// often root-owned and is replaced wholesale on update.
const DATA_DIR = path.join(os.homedir(), '.plum');

/**
 * Uploaded tests must be able to resolve the toolchain. A directory outside the
 * install tree cannot reach it by walking up, and NODE_PATH is not an answer:
 * Playwright's loader does not dedupe it against its own instance, so the run dies
 * with "two different versions of @playwright/test" and finds no tests. A link to
 * the node's own node_modules restores ordinary resolution. A junction is used on
 * Windows because, unlike a symlink, it needs no elevation.
 */
function linkToolchain(jobDir) {
	const target = path.join(BACKEND_DIR, 'node_modules');
	const link = path.join(jobDir, 'node_modules');
	if (!fs.existsSync(target) || fs.existsSync(link)) return;
	fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}
const STALE_ARTIFACT_MS = 24 * 60 * 60 * 1000;

/**
 * Removes job artifacts a previous process left behind.
 *
 * Each finished job deletes its own report file on a 10-minute timer held in
 * memory, so restarting a node orphans whatever was still pending, and a report
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
			if (!name.startsWith(ARTIFACT_PREFIX)) continue;
			const full = path.join(tmp, name);
			if (!older(full)) continue;
			fs.rmSync(full, { recursive: true, force: true });
			removed++;
		}
	} catch {}

	try {
		const jobsRoot = path.join(DATA_DIR, 'jobs');
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
// `framework` comes from the primary, since a node holds no project state. A
// primary old enough to send none can only have Cucumber projects.
function startJob({
	tags,
	browser = DEFAULT_BROWSER,
	workers = 1,
	framework,
	shard = null,
	tests = null,
	// Resolved by the primary from the project's own config; [] means unknown.
	projectNames = [],
	env: userEnv = {}
}) {
	const jobId = crypto.randomUUID();

	// path.resolve ensures absolute even if TMPDIR env var is set to a relative path
	const tmpdir = path.resolve(os.tmpdir());

	const jobsRoot = path.join(DATA_DIR, 'jobs');

	// Write test files sent by the primary into a per-job temp dir
	let tempTestsDir = null;
	if (tests && Object.keys(tests).length > 0) {
		tempTestsDir = path.join(jobsRoot, `plum-job-${jobId}`);
		for (const [rel, content] of Object.entries(tests)) {
			const dest = path.join(tempTestsDir, rel);
			// Keep writes inside the job dir, `rel` comes off the wire.
			if (dest !== tempTestsDir && !dest.startsWith(tempTestsDir + path.sep)) {
				throw new Error(`Illegal test path: ${rel}`);
			}
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, Buffer.from(content, 'base64'));
		}
		linkToolchain(tempTestsDir);
	}

	// Each job writes to its own temp file so concurrent jobs on the same node
	// cannot clobber each other's reports (shared cucumber_report.json race condition).
	const reportFile = path.join(tmpdir, `${ARTIFACT_PREFIX}report-${jobId}.json`);
	const ssDir = path.join(tmpdir, `${ARTIFACT_PREFIX}ss-${jobId}`);
	fs.mkdirSync(ssDir, { recursive: true });

	jobs[jobId] = {
		status: JOB_STATUS.RUNNING,
		logs: '',
		// Both drained by pollJob: the primary has no socket back to this node.
		rrwebBatches: [],
		exitCode: null,
		startedAt: Date.now(),
		meta: { tags: tags || '', browser, workers, framework, shard },
		tempTestsDir,
		reportFile,
		ssDir
	};

	const jobFramework = isFramework(framework) ? framework : FRAMEWORK.CUCUMBER;
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
		projectNames,
		// Which slice of the selection this lane runs, when the primary sharded
		// rather than splitting by tag.
		shard
	});

	const env = {
		...process.env,
		// User/test vars (BASE_URL, IS_HEADLESS, custom secrets) forwarded from the
		// primary's own .env: nodes are stateless runners and shouldn't need their
		// own copy. Spread before the job-control vars below so a stray same-named
		// var in the user's .env can never override how this job actually runs.
		...userEnv,
		...cmd.env,
		BROWSER: browser,
		PLUM_SS_DIR: ssDir,
		...(tempTestsDir ? { TESTS_ROOT: tempTestsDir } : {})
	};

	const ssPoller = startRRwebPoller(ssDir, (batch) => {
		jobs[jobId].rrwebBatches.push(batch);
	});

	jobs[jobId].logs += `> ${describeCommand(cmd)}\n`;
	// No shell, so an injected tag or browser name cannot become a command.
	const proc = spawn(cmd.command, cmd.args, { env, cwd: cmd.cwd });
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

// Drains and returns logs/rrweb batches since `offset`/`rrwebOffset`, used by
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
