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
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const prisma = require('../services/prisma');
const { TRIGGER_TYPE } = require('../constants/triggers');

const BACKEND_DIR = path.resolve(__dirname, '..');
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory job store: jobId → { status, exitCode, reportId, startedAt }
const jobs = new Map();

function pruneOldJobs() {
	const cutoff = Date.now() - JOB_TTL_MS;
	for (const [id, job] of jobs) {
		if (job.startedAt < cutoff) jobs.delete(id);
	}
}

router.post('/', jwtAuth, async (req, res, next) => {
	try {
		pruneOldJobs();

		const { tag = '', browser = 'chromium', workers = 1, baseUrl, testRunId } = req.body;

		const jobId = randomUUID();
		const startedAt = Date.now();
		jobs.set(jobId, { status: 'running', exitCode: null, reportId: null, startedAt });

		const env = {
			...process.env,
			TAG: tag,
			TRIGGER: TRIGGER_TYPE.MCP,
			BROWSER: browser,
			REPORT_RUNNERS: String(workers)
		};
		if (Number(workers) > 1) env.PARALLEL = String(workers);
		if (testRunId) env.TEST_RUN_ID = testRunId;
		if (baseUrl) env.BASE_URL = baseUrl;

		const proc = spawn('npm', ['run', 'test'], { env, shell: true, cwd: BACKEND_DIR });

		proc.on('close', async (code) => {
			try {
				// Find the latest report created after this job started
				const report = await prisma.report.findFirst({
					where: { createdAt: { gte: new Date(startedAt) } },
					orderBy: { createdAt: 'desc' },
					select: { id: true, status: true }
				});
				jobs.set(jobId, {
					status: code === 130 ? 'cancelled' : 'done',
					exitCode: code,
					reportId: report?.id ?? null,
					startedAt
				});
			} catch {
				jobs.set(jobId, { status: 'done', exitCode: code, reportId: null, startedAt });
			}
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
