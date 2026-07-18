/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/** In-flight state of a spawned test job (trigger/node-execution/cron job stores). */
const JOB_STATUS = Object.freeze({
	RUNNING: 'running',
	DONE: 'done',
	ERROR: 'error',
	PENDING: 'pending',
	CANCELLED: 'cancelled'
});

/** Final verdict stored on a Report row. */
const REPORT_STATUS = Object.freeze({
	PASS: 'PASS',
	FAIL: 'FAIL'
});

module.exports = { JOB_STATUS, REPORT_STATUS };
