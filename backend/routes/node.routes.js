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

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { authGuard } = require('../middleware/auth');
const { TRIGGER_REMOTE } = require('../constants/triggers');

const BACKEND_DIR = path.resolve(__dirname, '..');

// In-memory job store for active remote executions.
// Jobs are purged after 10 minutes post-completion.
const jobs = {};

// Health check — primary server uses this to confirm the node is reachable
router.get('/ping', authGuard, (req, res) => {
	res.json({ ok: true, mode: process.env.PLUM_MODE || 'server' });
});

// Graceful shutdown for node-mode processes (no-op on the primary server)
router.post('/shutdown', authGuard, (req, res) => {
	if (process.env.PLUM_MODE !== 'node') {
		return res.status(403).json({ error: 'Not a node runner' });
	}
	res.json({ ok: true });
	setTimeout(() => process.exit(0), 200);
});

// Start a remote test job
router.post('/execute', authGuard, (req, res) => {
	const { tags, browser = 'chromium', workers = 1, tests = null, env: userEnv = {} } = req.body;
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
		status: 'running',
		logs: '',
		exitCode: null,
		startedAt: Date.now(),
		meta: { tags: tags || '', browser, workers },
		tempTestsDir,
		reportFile,
		ssDir,
		pendingScreenshots: []
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

	const seenSsFiles = new Set();
	const ssPoller = setInterval(() => {
		const job = jobs[jobId];
		if (!job) {
			clearInterval(ssPoller);
			return;
		}
		try {
			const files = fs
				.readdirSync(ssDir)
				.filter((f) => f.endsWith('.ss.json'))
				.sort();
			for (const f of files) {
				if (seenSsFiles.has(f)) continue;
				seenSsFiles.add(f);
				const filePath = path.join(ssDir, f);
				const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				job.pendingScreenshots.push(data);
				try {
					fs.unlinkSync(filePath);
				} catch {}
			}
		} catch {}
	}, 400);

	const proc = spawn('npm', ['run', 'test'], { env, shell: true, cwd: BACKEND_DIR });
	proc.stdout.on('data', (d) => {
		jobs[jobId].logs += d.toString();
	});
	proc.stderr.on('data', (d) => {
		jobs[jobId].logs += d.toString();
	});
	proc.on('close', (code) => {
		clearInterval(ssPoller);
		jobs[jobId].status = code === 0 ? 'done' : 'error';
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

	res.json({ jobId, status: 'started' });
});

// Fetch the final report content after a job completes
router.get('/report/:jobId', authGuard, (req, res) => {
	const job = jobs[req.params.jobId];
	if (!job) return res.status(404).json({ error: 'Job not found' });
	if (!job.reportContent) return res.status(404).json({ error: 'Report not ready' });
	res.json({ content: job.reportContent, meta: job.meta });
});

// Poll job status and streamed logs
router.get('/execute/:jobId', authGuard, (req, res) => {
	const job = jobs[req.params.jobId];
	if (!job) return res.status(404).json({ error: 'Job not found' });

	const offset = parseInt(req.query.offset || '0', 10);
	const screenshots = job.pendingScreenshots.splice(0);
	res.json({
		status: job.status,
		logs: job.logs.slice(offset),
		exitCode: job.exitCode,
		screenshots
	});
});

module.exports = router;
