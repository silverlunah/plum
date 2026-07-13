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

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const prisma = require('../services/prisma');
const { startSsPoller } = require('../lib/screenshotPoller');
const { TRIGGER_TYPE } = require('../constants/triggers');

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

router.post('/', jwtAuth, async (req, res, next) => {
	try {
		pruneOldJobs();

		const { tag = '', browser = 'chromium', workers = 1, baseUrl, testRunId, source } = req.body;
		const trigger = source === 'mcp' ? TRIGGER_TYPE.MCP : TRIGGER_TYPE.EXTERNAL;

		const jobId = randomUUID();
		const startedAt = Date.now();
		jobs.set(jobId, { status: 'running', exitCode: null, reportId: null, startedAt });

		const ssDir = path.join(os.tmpdir(), `plum-trigger-ss-${jobId}`);
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

		const proc = spawn('npm', ['run', 'test'], { env, shell: true, cwd: BACKEND_DIR });

		if (_io) {
			_io.emit('bg-run-start', {
				runId: jobId,
				kind: trigger,
				label: trigger === TRIGGER_TYPE.MCP ? 'MCP run' : 'External run',
				meta: { tag, browser, workers }
			});
		}

		const ssPoller = startSsPoller(ssDir, ({ stepName, data }) => {
			if (_io) _io.emit('bg-run-screenshot', { runId: jobId, stepName, data });
		});

		proc.stdout.on('data', (d) => {
			if (_io) _io.emit('bg-run-log', { runId: jobId, log: d.toString() });
		});
		proc.stderr.on('data', (d) => {
			if (_io) _io.emit('bg-run-log', { runId: jobId, log: `[ERROR] ${d.toString()}` });
		});

		proc.on('close', async (code) => {
			clearInterval(ssPoller);
			fs.rm(ssDir, { recursive: true, force: true }, () => {});

			let reportId = null;
			try {
				// Find the latest report created after this job started
				const report = await prisma.report.findFirst({
					where: { createdAt: { gte: new Date(startedAt) } },
					orderBy: { createdAt: 'desc' },
					select: { id: true, status: true }
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

		res.status(202).json({ jobId, status: 'running' });
	} catch (e) {
		next(e);
	}
});

router.get('/:jobId', jwtAuth, (req, res) => {
	const job = jobs.get(req.params.jobId);
	if (!job) return res.status(404).json({ error: 'Job not found' });
	res.json(job);
});

module.exports = router;
router.setSocketIO = setSocketIO;
