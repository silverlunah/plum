/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Authoritative trigger type values stored in Report.triggerType.
 *
 * Manual and CLI are the only fixed values.
 * Scheduled runs store the cron job's taskName as the triggerType.
 */
const TRIGGER_TYPE = Object.freeze({
	MANUAL: 'manual-trigger',
	CLI: 'command-line-trigger',
	MCP: 'mcp-trigger',
	EXTERNAL: 'external-trigger'
});

/**
 * Sentinel written into partial node-mode report filenames (never stored in main DB).
 * Used by remote runner nodes and by the built-in lane when running as part of a
 * distributed job (PLUM_MODE=node blocks the DB write in generate-report.js).
 */
const TRIGGER_REMOTE = 'remote-trigger';

/** The string ID used throughout the codebase to refer to the built-in runner. */
const BUILT_IN_RUNNER_ID = 'built-in';

/**
 * All trigger values that are NOT a cron task name.
 * Anything outside this set is treated as a scheduled triggerType (i.e. the taskName).
 */
const NON_SCHEDULED_TRIGGERS = new Set([
	TRIGGER_TYPE.MANUAL,
	TRIGGER_TYPE.CLI,
	TRIGGER_TYPE.MCP,
	TRIGGER_TYPE.EXTERNAL,
	TRIGGER_REMOTE,
	'undefined'
]);

/** Returns true when triggerType is a cron job taskName (i.e. a scheduled run). */
function isScheduledTrigger(triggerType) {
	return !!triggerType && !NON_SCHEDULED_TRIGGERS.has(triggerType);
}

/** Normalises a raw TRIGGER env value for DB storage — falls back to CLI if blank. */
function normaliseTrigger(raw) {
	return raw || TRIGGER_TYPE.CLI;
}

module.exports = {
	TRIGGER_TYPE,
	TRIGGER_REMOTE,
	BUILT_IN_RUNNER_ID,
	NON_SCHEDULED_TRIGGERS,
	isScheduledTrigger,
	normaliseTrigger
};
