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

/**
 * Authoritative trigger type values stored in Report.triggerType.
 *
 * Manual and CLI are the only fixed values.
 * Scheduled runs store the cron job's taskName as the triggerType.
 */
const TRIGGER_TYPE = Object.freeze({
	MANUAL: 'manual-trigger',
	CLI: 'command-line-trigger',
	MCP: 'mcp-trigger'
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
