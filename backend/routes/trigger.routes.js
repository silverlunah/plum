/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { TRIGGER_TYPE } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { JOB_STATUS } = require('../constants/jobStatus');
const triggerService = require('../services/triggerService');

router.post('/', jwtAuth, async (req, res, next) => {
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
			tag,
			browser,
			workers,
			baseUrl,
			testRunId,
			trigger
		});
		res.status(202).json({ jobId, status: JOB_STATUS.RUNNING });
	} catch (e) {
		next(e);
	}
});

router.get('/:jobId', jwtAuth, (req, res) => {
	const job = triggerService.getJob(req.params.jobId);
	if (!job) return res.status(404).json({ error: 'Job not found' });
	res.json(job);
});

module.exports = router;
router.setSocketIO = triggerService.setSocketIO;
