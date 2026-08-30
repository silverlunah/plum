/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// ActivityLog.action values. Dotted <entity>.<verb> strings — the frontend maps
// each to a human sentence and icon. `scope` on the row (not here) decides who
// can see it: 'project' → that project's admins, 'org' → the owner.
const ACTIVITY_ACTION = Object.freeze({
	TEST_SUITE_CREATE: 'test_suite.create',
	TEST_SUITE_UPDATE: 'test_suite.update',
	TEST_SUITE_DELETE: 'test_suite.delete',

	TEST_CASE_CREATE: 'test_case.create',
	TEST_CASE_UPDATE: 'test_case.update',
	TEST_CASE_DELETE: 'test_case.delete',
	TEST_CASE_STEPS_UPDATE: 'test_case.steps_update',

	TEST_RUN_CREATE: 'test_run.create',
	TEST_RUN_UPDATE: 'test_run.update',
	TEST_RUN_DELETE: 'test_run.delete',
	TEST_RUN_ENTRY_ASSIGN: 'test_run.entry_assign',
	TEST_RUN_ENTRY_RESULT: 'test_run.entry_result',

	SCHEDULE_CREATE: 'schedule.create',
	SCHEDULE_UPDATE: 'schedule.update',
	SCHEDULE_DELETE: 'schedule.delete',
	SCHEDULE_TOGGLE: 'schedule.toggle',

	INTEGRATIONS_UPDATE: 'integrations.update',
	PROJECT_SETTINGS_UPDATE: 'project.settings_update',
	PROJECT_PREFIXES_UPDATE: 'project.prefixes_update',

	MEMBER_ADD: 'member.add',
	MEMBER_REMOVE: 'member.remove',

	MCP_KEY_GENERATE: 'mcp_key.generate',
	MCP_KEY_REVOKE: 'mcp_key.revoke',

	// -- org scope --
	PROJECT_CREATE: 'project.create',
	PROJECT_DELETE: 'project.delete',

	USER_CREATE: 'user.create',
	USER_UPDATE: 'user.update',
	USER_ROLE_CHANGE: 'user.role_change',
	USER_DELETE: 'user.delete',

	NODE_CREATE: 'node.create',
	NODE_UPDATE: 'node.update',
	NODE_DELETE: 'node.delete',

	BACKUP_CONFIG_UPDATE: 'backup.config_update',
	ACTIVITY_RETENTION_UPDATE: 'activity.retention_update'
});

const ACTIVITY_SCOPE = Object.freeze({ PROJECT: 'project', ORG: 'org' });

const ACTIVITY_SOURCE = Object.freeze({ UI: 'ui', MCP: 'mcp', CRON: 'cron', CI: 'ci' });

// Retention windows offered in the UI. 0 = keep forever.
const ACTIVITY_RETENTION_DAYS = Object.freeze([0, 30, 90, 180, 365]);

module.exports = {
	ACTIVITY_ACTION,
	ACTIVITY_SCOPE,
	ACTIVITY_SOURCE,
	ACTIVITY_RETENTION_DAYS
};
