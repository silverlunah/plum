/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const runQueueService = require('./runQueueService');
const { TRIGGER_TYPE, BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');

// The REST/MCP trigger API is a thin front door onto the run queue. `getJob`
// keeps the old poll shape so GET /trigger/:jobId callers don't have to change.
async function startRun({
	tag = '',
	browser = DEFAULT_BROWSER,
	workers = 1,
	baseUrl,
	testRunId,
	trigger
}) {
	return runQueueService.enqueue({
		kind: trigger,
		triggerType: trigger,
		label: trigger === TRIGGER_TYPE.MCP ? 'MCP run' : 'External run',
		tag,
		browser,
		workers,
		baseUrl,
		testRunId,
		runnerIds: [BUILT_IN_RUNNER_ID]
	});
}

const getJob = (jobId) => runQueueService.getJob(jobId);

module.exports = { startRun, getJob };
