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
const { jwtAuth } = require('../middleware/jwtAuth');
const { TRIGGER_TYPE } = require('../constants/triggers');
const triggerService = require('../services/triggerService');

router.post('/', jwtAuth, async (req, res, next) => {
	try {
		const { tag = '', browser = 'chromium', workers = 1, baseUrl, testRunId, source } = req.body;
		const trigger = source === 'mcp' ? TRIGGER_TYPE.MCP : TRIGGER_TYPE.EXTERNAL;

		const jobId = await triggerService.startRun({
			tag,
			browser,
			workers,
			baseUrl,
			testRunId,
			trigger
		});
		res.status(202).json({ jobId, status: 'running' });
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
