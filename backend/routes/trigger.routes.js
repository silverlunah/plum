/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');
const { TRIGGER_TYPE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { JOB_STATUS } = require('../constants/jobStatus');
const triggerService = require('../services/triggerService');

router.use(jwtAuth, requireProjectAccess);

router.post('/', async (req, res, next) => {
	try {
		const {
			tag = '',
			browser = DEFAULT_BROWSER,
			workers = 1,
			baseUrl,
			testRunId,
			source
		} = req.body;
		const trigger = source === 'mcp' ? TRIGGER_TYPE.MCP : TRIGGER_TYPE.EXTERNAL;

		const jobId = await triggerService.startRun({
			projectId: req.projectId,
			tag,
			browser,
			workers,
			baseUrl,
			testRunId,
			trigger,
			startedBy: req.user.name ?? null
		});
		res.status(202).json({ jobId, status: JOB_STATUS.RUNNING });
	} catch (e) {
		next(e);
	}
});

router.get('/:jobId', async (req, res, next) => {
	try {
		const job = await triggerService.getJob(req.params.jobId, req.projectId);
		if (!job) return res.status(404).json({ error: 'Job not found' });
		res.json(job);
	} catch (e) {
		next(e);
	}
});

module.exports = router;
