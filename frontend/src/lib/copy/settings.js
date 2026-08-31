/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { SAVING_LABEL, SAVE_LABEL } from './common';

export const PAGE_TITLE = 'Settings — Plum';
export const HEADING = 'Settings';

export const NAME_LABEL = 'Name';
export const NETWORK_ERROR = 'Network error';

const COPIED_LABEL = 'Copied!';

// ── Nav / section labels ──
export const PROJECT_LABEL = 'Project';
export const RUNNERS_LABEL = 'Runners';
export const REPOSITORY_NAV_LABEL = 'Repository';
export const REPOSITORY_HEADING = 'Test Repository';
export const TEST_CASES_NAV_LABEL = 'Test Cases';
export const TEST_CASES_HEADING = 'Test Cases';
export const TEST_CASES_DESC = 'Import, export and configure this project’s test repository.';
export const TC_EXPORT_CARD_TITLE = 'Export';
export const TC_EXPORT_DESC =
	'Download every suite and case in this project as a JSON or CSV file.';
export const TC_IMPORT_CARD_TITLE = 'Import';
export const TC_IMPORT_DESC =
	'Upload a JSON file exported from Test Repository. Suites and cases are added as new records.';
export const TC_IMPORT_HINT =
	'A case is skipped when its ID already exists here. Cases with a different prefix or no ID are imported with a fresh ID.';
export const TC_IMPORT_FAILED_FALLBACK = 'Could not read that file.';
export const tcImportLabel = (importing) => (importing ? 'Importing…' : 'Import');
export const tcImportSummary = ({ importedCases, importedSuites, skippedCases, skippedSuites }) => {
	const imported = `Imported ${importedCases} ${importedCases === 1 ? 'case' : 'cases'} in ${importedSuites} ${importedSuites === 1 ? 'suite' : 'suites'}`;
	const skipped = skippedCases + skippedSuites;
	return skipped > 0 ? `${imported} · skipped ${skippedCases} already here` : imported + '.';
};
export const INTEGRATIONS_LABEL = 'Integrations';
export const MCP_NAV_LABEL = 'MCP';
export const MCP_HEADING = 'MCP Integration';
export const ACCOUNT_LABEL = 'Account';
export const USERS_LABEL = 'Users';
export const BACKUP_LABEL = 'Backup';

// ── Section descriptions ──
export const PROJECT_DESC = 'Identity information shown across the UI';
export const RUNNERS_DESC =
	'Register self-hosted runner nodes to distribute tests across machines.';
export const REPOSITORY_DESC = 'Configure ID prefixes for test suites and cases.';
export const INTEGRATIONS_DESC =
	'Connect Discord and Slack to receive run notifications with pass/fail results and report links.';
export const MCP_DESC =
	'Your personal API key for this project. An MCP client using it acts as you, with your role, scoped to this project — anything it creates or runs is tagged “(MCP)”.';
export const ACCOUNT_DESC = 'Manage your profile, credentials and session.';
export const USERS_DESC = 'Add and manage who can access Plum.';
export const BACKUP_DESC =
	'Export your test cases, schedules, users, and project settings. Automate uploads to any S3-compatible storage — Cloudflare R2, Backblaze B2, AWS S3, or MinIO.';

// ── Runner requests / toasts ──
export const REMOVE_RUNNER_FAILED = 'Failed to remove runner.';

export const runnerRemovedToast = (name) => `Runner "${name}" removed.`;
export const runnerStoppedToast = (name) => `Runner "${name}" stopped.`;
export const runnerStopFailedToast = (name, error) =>
	`Could not stop "${name}": ${error ?? 'unknown error'}`;
export const runnerStopFailedGenericToast = (name) => `Could not stop "${name}".`;
export const runnerRestartingToast = (name) => `Runner "${name}" restarting…`;
export const runnerRestartFailedToast = (name, error) =>
	`Could not restart "${name}": ${error ?? 'unknown error'}`;
export const runnerRestartFailedGenericToast = (name) => `Could not restart "${name}".`;

// ── Project ──
export const PROJECT_NAME_LABEL = 'Project Name';
export const PROJECT_NAME_PLACEHOLDER = 'My Test Suite';
export const LOGO_URL_LABEL = 'Logo URL (optional)';
export const LOGO_URL_HINT = 'Direct link to an image (PNG, SVG, JPG)';
export const LOGO_URL_PLACEHOLDER = 'https://example.com/logo.png';
export const PREVIEW_LABEL = 'Preview';
export const LOGO_PREVIEW_ALT = 'Project logo preview';
export const TIMEZONE_LABEL = 'Timezone';
export const TIMEZONE_HINT = 'Used to schedule this project’s cron test runs';
export const RETRY_FAILED_TESTS_LABEL = 'Retry failed tests';
export const RETRY_FAILED_TESTS_HINT =
	'Automatically re-run failed scenarios up to this many times before finalizing the report. 0 disables retries.';
export const DARK_MODE_LABEL = 'Dark mode';
export const DOCUMENTATION_LABEL = 'Documentation';
export const DARK_MODE_DESC = 'Switch between light and dark appearance';
export const PROJECT_SAVED_TOAST = 'Project settings saved.';
export const PROJECT_SAVE_FAILED = 'Failed to save project settings.';

export const saveProjectLabel = (saving) => (saving ? SAVING_LABEL : 'Save Project');

// ── Runners ──
export const BUILTIN_RUNNER_TOGGLE_LABEL = 'Built-in runner';
export const BUILTIN_RUNNER_TOGGLE_DESC =
	'Use this server to run tests locally. Disable to route all runs to external nodes. Applies to everyone on this instance.';
export const BUILTIN_RUNNER_TOGGLE_FAILED = 'Could not update the built-in runner setting.';
export const RUNNER_UNREACHABLE_LABEL = 'unreachable';
export const RUNNER_PINGING_LABEL = 'pinging…';
export const REMOVE_LABEL = 'Remove';

export const NODE_SECRET_LABEL = 'Registration secret';
export const NODE_SECRET_DESC =
	'A node on another machine needs this to register. `plum server` also prints it. A node on the server box reads it on its own.';
export const NODE_SECRET_REVEAL_TITLE = 'Show';
export const NODE_SECRET_HIDE_TITLE = 'Hide';
export const NODE_SECRET_COPY_TITLE = 'Copy';
export const NODE_SECRET_COPIED_TITLE = 'Copied';
export const REGENERATE_NODE_SECRET_LABEL = 'Regenerate';
export const REGENERATE_NODE_SECRET_MODAL_TITLE = 'Regenerate the registration secret?';
export const REGENERATE_NODE_SECRET_WARNING =
	'The current secret stops working immediately. Online nodes are updated automatically; any offline node must be re-run with the new secret (or reads it from the server box).';
export const nodeSecretAppliedToast = (n) =>
	n === 0
		? 'New secret generated.'
		: `New secret generated and pushed to ${n} node${n === 1 ? '' : 's'}.`;
export const nodeSecretFailedNodes = (names) =>
	`Couldn’t reach: ${names.join(', ')} — update the secret there manually.`;
export const REGENERATE_NODE_SECRET_FAILED = 'Failed to regenerate the secret.';

export const REGISTER_NODE_NOTE_TITLE = 'Adding a node';
export const REGISTER_NODE_NOTE_PREFIX = 'Register nodes from the node machine — run';
export const REGISTER_NODE_NOTE_MIDDLE = 'to start one and self-register it, or';
export const REGISTER_NODE_NOTE_SUFFIX =
	'to manage nodes already set up on that machine. Nodes need the primary’s PLUM_NODE_SECRET, printed by "plum server".';

const RESTART_LABEL = 'Restart';
const RESTARTING_LABEL = 'Restarting…';
const STOP_LABEL = 'Stop';
const STOPPING_LABEL = 'Stopping…';

export const restartRunnerLabel = (restarting) => (restarting ? RESTARTING_LABEL : RESTART_LABEL);
export const stopRunnerLabel = (stopping) => (stopping ? STOPPING_LABEL : STOP_LABEL);

// ── Repository (prefixes) ──
export const CASE_PREFIX_LABEL = 'Test Case prefix';
export const CASE_PREFIX_PLACEHOLDER = 'TC';
export const SUITE_PREFIX_LABEL = 'Test Suite prefix';
export const SUITE_PREFIX_PLACEHOLDER = 'TS';
export const EXAMPLES_LABEL = 'Examples:';
export const PREFIXES_SAVED_TOAST = 'Prefixes saved.';
export const PREFIXES_SAVE_FAILED = 'Failed to save prefixes.';
export const MIGRATE_IDS_HEADING = 'Migrate IDs';
export const MIGRATE_DESC_PREFIX =
	'Rename all existing test IDs to use a new prefix. Cucumber tags in code are';
export const MIGRATE_DESC_STRONG = 'not';
export const MIGRATE_DESC_SUFFIX = 'affected — you manage those separately.';
export const NEW_CASE_PREFIX_LABEL = 'New case prefix';
export const NEW_SUITE_PREFIX_LABEL = 'New suite prefix';
export const MIGRATION_COMPLETE_TOAST = 'Prefix migration complete. All IDs updated.';
export const MIGRATION_FAILED_TOAST = 'Migration failed.';

export const savePrefixesLabel = (saving) => (saving ? SAVING_LABEL : 'Save Prefixes');
export const runMigrationLabel = (migrating) => (migrating ? 'Migrating…' : 'Run Migration');

// ── Integrations ──
export const WEBHOOKS_CARD_TITLE = 'Webhooks';
export const DISCORD_WEBHOOK_LABEL = 'Discord Webhook URL';
export const DISCORD_WEBHOOK_HINT = 'Leave blank to disable Discord notifications';
export const DISCORD_WEBHOOK_PLACEHOLDER = 'https://discord.com/api/webhooks/…';
export const SLACK_WEBHOOK_LABEL = 'Slack Webhook URL';
export const SLACK_WEBHOOK_HINT = 'Leave blank to disable Slack notifications';
export const SLACK_WEBHOOK_PLACEHOLDER = 'https://hooks.slack.com/services/…';
export const PUBLIC_URL_LABEL = 'Public URL';
export const PUBLIC_URL_HINT =
	'Base URL of this Plum instance — used to link reports in notifications, and by remote runner nodes to stream live test output back here';
export const PUBLIC_URL_PLACEHOLDER = 'https://plum.yourcompany.com';
export const INTEGRATIONS_SAVED_TOAST = 'Integration settings saved.';
export const INTEGRATIONS_SAVE_FAILED = 'Failed to save integration settings.';

export const CI_TRIGGERS_CARD_TITLE = 'CI / External Triggers';
export const CI_DESC_PART1 =
	'Trigger a Plum run from GitHub Actions (e.g. on a pull request, against its preview deployment) or any other external script by calling';
export const CI_DESC_PART2 = 'with an';
export const CI_DESC_PART3 = 'header. Generate a key on the';
export const MCP_TAB_LINK_LABEL = 'MCP tab';
export const CI_DESC_PART4 =
	'and store it as a repo secret — never commit it directly. Runs triggered this way show up in Reports tagged';
export const EXTERNAL_BADGE_LABEL = 'External';

const COPY_WORKFLOW_STEP_LABEL = 'Copy Workflow Step';

export const saveIntegrationsLabel = (saving) => (saving ? SAVING_LABEL : 'Save Integrations');
export const copyCiSnippetLabel = (copied) => (copied ? COPIED_LABEL : COPY_WORKFLOW_STEP_LABEL);

// ── MCP ──
export const API_KEY_CARD_TITLE = 'Your API Key';
export const NO_KEY_GENERATED_MESSAGE = 'You have no MCP key for this project yet.';
export const HIDE_KEY_TITLE = 'Hide key';
export const SHOW_KEY_TITLE = 'Show key';
export const COPY_KEY_TITLE = 'Copy key';
export const MCP_REGEN_NOTE = 'Regenerating invalidates your existing key immediately.';
export const REVOKE_KEY_LABEL = 'Revoke Key';
export const CONFIG_SNIPPET_CARD_TITLE = 'Config Snippet';
export const CONFIG_SNIPPET_DESC_PREFIX = "Add this to your MCP client's config file (e.g.";
export const CONFIG_SNIPPET_DESC_SUFFIX = ', Cursor MCP settings, etc.).';
export const MCP_KEY_GENERATED_TOAST = 'MCP key generated.';
export const MCP_KEY_REVOKED_TOAST = 'MCP key revoked.';
export const MCP_KEY_REVOKE_FAILED = 'Could not revoke the key.';
export const MCP_KEY_GENERATE_FAILED = 'Failed to generate MCP key.';

const COPY_CONFIG_LABEL = 'Copy Config';

export const generateKeyLabel = (generating) => (generating ? 'Generating…' : 'Generate Key');
export const regenerateKeyLabel = (generating) => (generating ? 'Generating…' : 'Regenerate Key');
export const copyMcpSnippetLabel = (copied) => (copied ? COPIED_LABEL : COPY_CONFIG_LABEL);

// ── Account ──
export const PROFILE_CARD_TITLE = 'Profile';
export const CHANGE_PASSWORD_CARD_TITLE = 'Change password';
export const CURRENT_PASSWORD_LABEL = 'Current password';
export const NEW_PASSWORD_LABEL = 'New password';
export const CONFIRM_NEW_PASSWORD_LABEL = 'Confirm new password';
export const SIGN_OUT_LABEL = 'Sign out';
export const PROFILE_UPDATED_TOAST = 'Profile updated.';
export const PASSWORDS_NO_MATCH_ERROR = 'Passwords do not match.';
export const PASSWORD_TOO_SHORT_ERROR = 'Password must be at least 8 characters.';
export const PASSWORD_CHANGED_TOAST = 'Password changed.';

export const saveProfileLabel = (saving) => (saving ? SAVING_LABEL : 'Save Profile');
export const changePasswordLabel = (saving) => (saving ? SAVING_LABEL : 'Change Password');

// ── Users ──
export const REMOVE_USER_MODAL_TITLE = 'Remove User';
export const REMOVE_USER_LABEL = 'Remove';
export const REMOVE_USER_BODY_PREFIX = 'Remove';
export const REMOVE_USER_BODY_SUFFIX = '? They will lose access immediately.';
export const ADD_USER_CARD_TITLE = 'Add User';
export const ALL_USERS_CARD_TITLE = 'All Users';
export const USER_NAME_PLACEHOLDER = 'Jane Smith';
export const USER_EMAIL_PLACEHOLDER = 'jane@example.com';
export const PASSWORD_LABEL = 'Password';
export const ROLE_LABEL = 'Role';
export const USER_ROLE_OPTION = 'User';
export const ADMIN_ROLE_OPTION = 'Admin';
export const OWNER_ROLE_OPTION = 'Owner';
export const REMOVE_USER_ICON_TITLE = 'Remove user';
export const YOU_CHIP_LABEL = 'you';
export const USER_FORM_REQUIRED_ERROR = 'Name, email and password are required.';
export const USER_PROJECTS_LABEL = 'Assigned projects';
export const USER_NO_PROJECTS = 'Not assigned to any project.';
export const USER_ALL_PROJECTS = 'Every project (owner).';

export const addUserLabel = (saving) => (saving ? 'Adding…' : 'Add User');
export const userAddedToast = (name) => `User "${name}" added.`;
export const userRemovedToast = (name) => `User "${name}" removed.`;

// ── Backup ──
export const MANUAL_BACKUP_CARD_TITLE = 'Manual Backup';
export const EXPORT_BLOCK_TITLE = 'Export';
export const EXPORT_BLOCK_DESC_PREFIX = 'Downloads a';
export const EXPORT_BLOCK_DESC_SUFFIX =
	'file with all cron jobs, test cases, test runs, users, runners, and project settings.';
export const IMPORT_BLOCK_TITLE = 'Import';
export const IMPORT_BLOCK_DESC =
	'Restores all data from a previously exported backup. Existing records are overwritten. Cron jobs are re-scheduled after import.';
export const CHOOSE_FILE_LABEL = 'Choose file…';
export const INCLUDE_REPORTS_LABEL = 'Include reports & recordings';
export const INCLUDE_REPORTS_HINT =
	'Applies to both manual export and scheduled S3 backups. Can make backups significantly larger — recordings are session replays, not just screenshots.';
export const includeReportsDisclaimer = (included) =>
	included
		? 'Reports and recordings are included in backups.'
		: 'Reports are not included in backups — enable "Include reports & recordings" above, or run pg_dump directly on the PostgreSQL volume, to back up report history.';
export const saveIncludeReportsLabel = (saving) => (saving ? SAVING_LABEL : SAVE_LABEL);

export const S3_STORAGE_CARD_TITLE = 'S3 Storage';
export const S3_STORAGE_DESC_PREFIX =
	'Works with any S3-compatible provider — Cloudflare R2, Backblaze B2, AWS S3, or MinIO. Leave';
export const ENDPOINT_URL_LABEL = 'Endpoint URL';
export const S3_STORAGE_DESC_SUFFIX = 'empty for AWS S3.';
export const ENDPOINT_URL_HINT = 'Leave blank for AWS S3';
export const ENDPOINT_URL_PLACEHOLDER = 'https://account.r2.cloudflarestorage.com';
export const REGION_LABEL = 'Region';
export const REGION_HINT_PREFIX = 'Use';
export const REGION_HINT_SUFFIX = 'for Cloudflare R2';
export const REGION_PLACEHOLDER = 'us-east-1';
export const BUCKET_LABEL = 'Bucket';
export const BUCKET_PLACEHOLDER = 'my-plum-backups';
export const PATH_PREFIX_LABEL = 'Path Prefix';
export const PATH_PREFIX_HINT = 'Optional folder inside the bucket';
export const PATH_PREFIX_PLACEHOLDER = 'plum/';
export const ACCESS_KEY_LABEL = 'Access Key ID';
export const ACCESS_KEY_PLACEHOLDER = 'AKIAIOSFODNN7EXAMPLE';
export const SECRET_KEY_LABEL = 'Secret Access Key';
export const TEST_CONNECTION_LABEL = 'Test Connection';
export const SAVE_S3_CONFIG_LABEL = 'Save S3 Config';
export const S3_CONNECTION_SUCCESS = 'Connection successful.';
export const S3_CONNECTION_FAILED = 'Connection failed.';
export const BACKUP_CONFIG_SAVED_TOAST = 'Backup configuration saved.';
export const BACKUP_CONFIG_SAVE_FAILED = 'Failed to save backup configuration.';

const SECRET_KEY_REQUIRED_HINT = 'Required';
const SECRET_KEY_ALREADY_SET_HINT = 'A key is already saved — leave blank to keep it';
const SECRET_KEY_SET_PLACEHOLDER = '••••••••';
const SECRET_KEY_UNSET_PLACEHOLDER = 'Enter secret key';
const TESTING_LABEL = 'Testing…';

export const RESTORE_FROM_S3_CARD_TITLE = 'Restore from S3';
export const RESTORE_FROM_S3_DESC =
	'Restores directly from a backup already uploaded to S3 — no need to download it yourself first. Existing records are overwritten. Cron jobs are re-scheduled after restore.';
export const CONFIGURE_S3_FIRST_RESTORE_MESSAGE = 'Configure S3 storage above to restore from it.';
export const NO_S3_BACKUPS_MESSAGE = 'No backups found at this bucket/prefix.';
export const REFRESH_LABEL = 'Refresh';
export const RESTORE_CONFIRM_TITLE = 'Restore this backup?';
export const restoreConfirmBody = (key) =>
	`This will overwrite current cron jobs, test cases, test runs, users, runners, and project settings with the contents of "${key}". This cannot be undone.`;
export const RESTORE_SUCCESS_TOAST = 'Restored from S3 successfully.';
export const RESTORE_FAILED_FALLBACK = 'Restore failed.';
export const LIST_S3_BACKUPS_FAILED = 'Failed to list S3 backups.';

export const SCHEDULED_BACKUP_CARD_TITLE = 'Scheduled Backup';
export const CONFIGURE_S3_FIRST_MESSAGE = 'Configure S3 storage above to enable scheduled backups.';
export const ENABLE_SCHEDULED_BACKUP_LABEL = 'Enable scheduled backup';
export const CRON_EXPRESSION_LABEL = 'Cron Expression';
export const CRON_HINT_PREFIX = '5-field cron — e.g.';
export const CRON_HINT_SUFFIX = '= daily at 2 AM.';
export const CRONTAB_LINK_LABEL = 'Test at crontab.guru ↗';
export const CRON_PLACEHOLDER = '0 2 * * *';
export const BACKUP_TIMEZONE_LABEL = 'Schedule Timezone';
export const BACKUP_TIMEZONE_HINT =
	'The cron above fires on this timezone. Backup is instance-wide.';
export const BACKUP_LAST_RUN_PREFIX = 'Last backup:';
export const BACKUP_DOWNLOADED_TOAST = 'Backup downloaded.';
export const EXPORT_FAILED_TOAST = 'Export failed.';
export const IMPORT_SUCCESS_TOAST = 'Import successful. Cron jobs have been re-scheduled.';
export const IMPORT_FAILED_FALLBACK = 'Import failed. Check the file format.';
export const BACKUP_UPLOAD_SUCCESS_TOAST = 'Backup uploaded to S3 successfully.';
export const BACKUP_UPLOAD_FAILED_FALLBACK = 'Backup failed. Check your S3 configuration.';

const UPLOAD_TO_S3_NOW_LABEL = 'Upload to S3 Now';
const UPLOADING_LABEL = 'Uploading…';
const SAVE_SCHEDULE_LABEL = 'Save Schedule';

export const backupFilename = (date) => `plum-backup-${date}.json`;
export const exportLabel = (exporting) => (exporting ? 'Exporting…' : 'Export JSON');
export const importLabel = (importing) => (importing ? 'Importing…' : 'Import');
export const secretKeyHint = (isSet) =>
	isSet ? SECRET_KEY_ALREADY_SET_HINT : SECRET_KEY_REQUIRED_HINT;
export const secretKeyPlaceholder = (isSet) =>
	isSet ? SECRET_KEY_SET_PLACEHOLDER : SECRET_KEY_UNSET_PLACEHOLDER;
export const testConnectionLabel = (testing) => (testing ? TESTING_LABEL : TEST_CONNECTION_LABEL);
export const saveS3ConfigLabel = (saving) => (saving ? SAVING_LABEL : SAVE_S3_CONFIG_LABEL);
export const uploadedToLabel = (destination) => `uploaded to ${destination}`;
export const uploadS3NowLabel = (running) => (running ? UPLOADING_LABEL : UPLOAD_TO_S3_NOW_LABEL);
export const saveScheduleLabel = (saving) => (saving ? SAVING_LABEL : SAVE_SCHEDULE_LABEL);
export const restoreLabel = (restoring) => (restoring ? 'Restoring…' : 'Restore');
export const refreshingLabel = (loading) => (loading ? 'Loading…' : REFRESH_LABEL);
export const backupSizeLabel = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// ── Activity logs ──
export const ACTIVITY_LABEL = 'Activity logs';
export const ACTIVITY_DESC = 'Who changed what, and when.';
export const ACTIVITY_SCOPE_PROJECT_LABEL = 'This project';
export const ACTIVITY_SCOPE_ORG_LABEL = 'Organization';
export const ACTIVITY_FILTER_ALL_ACTIONS = 'All events';
export const ACTIVITY_FILTER_ALL_ACTORS = 'Anyone';
export const ACTIVITY_SEARCH_PLACEHOLDER = 'Search by name or item…';
export const ACTIVITY_EMPTY_TITLE = 'Nothing logged yet';
export const ACTIVITY_EMPTY_BODY = 'Changes to this project show up here as people make them.';
export const ACTIVITY_ORG_EMPTY_BODY =
	'Account-wide changes — users, projects, nodes, backup — show up here.';
export const ACTIVITY_LOAD_MORE_LABEL = 'Load more';
export const ACTIVITY_RETENTION_CARD_TITLE = 'Retention';
export const ACTIVITY_RETENTION_DESC =
	'How long entries are kept. A clean-up job runs every night at 3:17 AM (server time) and deletes anything older.';
export const ACTIVITY_RETENTION_SAVED_TOAST = 'Retention updated.';
export const ACTIVITY_RETENTION_SAVE_FAILED = 'Failed to update retention.';
export const activityRetentionOptionLabel = (days) =>
	days === 0 ? 'Keep forever' : `${days} days`;
export const activityCountLabel = (n) => `${n} ${n === 1 ? 'event' : 'events'}`;

// action → { verb shown between actor and target, tone for the status dot }.
// Dynamic detail (a result, a from/to) is folded in by activityDescription below.
const ACTIVITY_ACTION_META = {
	'test_suite.create': { verb: 'created test suite', tone: 'create' },
	'test_suite.update': { verb: 'edited test suite', tone: 'update' },
	'test_suite.delete': { verb: 'deleted test suite', tone: 'delete' },
	'test_case.create': { verb: 'created test case', tone: 'create' },
	'test_case.update': { verb: 'edited test case', tone: 'update' },
	'test_case.delete': { verb: 'deleted test case', tone: 'delete' },
	'test_case.steps_update': { verb: 'updated the steps of', tone: 'update' },
	'test_run.create': { verb: 'created test run', tone: 'create' },
	'test_run.update': { verb: 'updated test run', tone: 'update' },
	'test_run.delete': { verb: 'deleted test run', tone: 'delete' },
	'test_run.entry_assign': { verb: 'changed the assignee on', tone: 'neutral' },
	'test_run.entry_result': { verb: 'recorded a result on', tone: 'update' },
	'schedule.create': { verb: 'created schedule', tone: 'create' },
	'schedule.update': { verb: 'edited schedule', tone: 'update' },
	'schedule.delete': { verb: 'deleted schedule', tone: 'delete' },
	'schedule.toggle': { verb: 'toggled schedule', tone: 'neutral' },
	'integrations.update': { verb: 'updated integrations for', tone: 'update' },
	'project.settings_update': { verb: 'updated settings for', tone: 'update' },
	'project.prefixes_update': { verb: 'changed ID prefixes for', tone: 'update' },
	'member.add': { verb: 'added', tone: 'create' },
	'member.remove': { verb: 'removed', tone: 'delete' },
	'mcp_key.generate': { verb: 'generated an', tone: 'neutral' },
	'mcp_key.revoke': { verb: 'revoked an', tone: 'delete' },
	'project.create': { verb: 'created project', tone: 'create' },
	'project.delete': { verb: 'deleted project', tone: 'delete' },
	'user.create': { verb: 'added user', tone: 'create' },
	'user.update': { verb: 'edited user', tone: 'update' },
	'user.role_change': { verb: 'changed the role of', tone: 'update' },
	'user.delete': { verb: 'deleted user', tone: 'delete' },
	'node.create': { verb: 'registered node', tone: 'create' },
	'node.update': { verb: 'updated node', tone: 'update' },
	'node.delete': { verb: 'removed node', tone: 'delete' },
	'backup.config_update': { verb: 'updated the', tone: 'update' },
	'activity.retention_update': { verb: 'changed', tone: 'update' }
};

export function activityTone(action) {
	return ACTIVITY_ACTION_META[action]?.tone ?? 'neutral';
}

// { verb, target, detail } — the row renders "<actor> <verb> <target>" with an
// optional trailing "(<detail>)".
export function activityDescription(entry) {
	const meta = ACTIVITY_ACTION_META[entry.action];
	const verb = meta?.verb ?? entry.action.replace(/[._]/g, ' ');
	const m = entry.metadata ?? {};
	let detail = '';
	let suffix = '';

	if (entry.action === 'test_run.entry_result') detail = m.result ?? '';
	else if (entry.action === 'test_run.update' && m.changed?.includes('status'))
		detail = `${m.from} → ${m.to}`;
	else if (entry.action === 'test_run.entry_assign')
		detail = m.assignedTo ? `now ${m.assignedTo}` : 'unassigned';
	else if (entry.action === 'schedule.toggle') detail = m.enabled ? 'enabled' : 'disabled';
	else if (entry.action === 'user.role_change' || entry.action === 'user.update')
		detail = m.from && m.to ? `${m.from} → ${m.to}` : '';
	else if (entry.action === 'member.add' || entry.action === 'member.remove')
		suffix = m.project ? ` ${entry.action === 'member.add' ? 'to' : 'from'} ${m.project}` : '';
	else if (entry.action === 'project.prefixes_update' && m.testCasePrefix)
		detail = `${m.testCasePrefix} · ${m.testSuitePrefix}`;
	else if (entry.action === 'activity.retention_update')
		detail = m.days === 0 ? 'keep forever' : `${m.days} days`;

	return { verb, target: entry.targetLabel + suffix, detail };
}

// ── Update banner (owner) ──
export const updateBannerText = (latest) =>
	`Plum ${latest} is available. Run "plum update" on the server to upgrade.`;
export const UPDATE_NPM_LINK_LABEL = 'Release notes';

// ── Projects & access (Project tab) ──
export const MANAGE_PROJECTS_LINK_LABEL = 'Manage projects & access →';
export const CURRENT_PROJECT_LABEL = 'Current project';
export const NEW_PROJECT_LABEL = 'New project';
export const NEW_PROJECT_BASE_URL_LABEL = 'Base URL (optional)';
export const CREATE_PROJECT_LABEL = 'Create';

export const OTHER_PROJECTS_LABEL = 'Other projects';
export const DELETE_PROJECT_LABEL = 'Delete';
export const projectRowMeta = (slug, n) => `${slug} · ${n} member${n === 1 ? '' : 's'}`;
export const DELETE_PROJECT_MODAL_TITLE = 'Delete project';
export const deleteProjectWarning = (name) =>
	`Deleting “${name}” permanently removes every test case, run, report, schedule and its test folder. Users keep their accounts and their names stay on past runs, but the project itself cannot be recovered.`;
export const DELETE_CONTINUE_LABEL = 'I understand — continue';
export const deleteProjectConfirmPrompt = (slug) =>
	`Type the project folder name (${slug}) to permanently delete:`;
export const CONFIRM_DELETE_PROJECT_LABEL = 'Delete this project';

export const PROJECT_MEMBERS_LABEL = 'Members of this project';
export const PROJECT_MEMBERS_HINT =
	'The owner is on every project. Add admins and users, then remove them any time — removing someone only revokes access, their test cases and their name on past runs stay.';
export const ROLE_PERMISSIONS_LINK = 'What can each role do?';
export const MANAGE_USERS_LINK = 'Add or edit users →';
export const MEMBER_SEARCH_PLACEHOLDER = 'Search people to add…';
export const NO_MEMBERS_YET = 'No one else is assigned yet — search above to add someone.';
export const REMOVE_MEMBER_TITLE = 'Remove from this project';
export const OWNER_MEMBER_TAG = 'Every project';

// Role capability matrix shown in the "What can each role do?" modal.
export const ROLE_PERMISSIONS_MODAL_TITLE = 'Role permissions';
export const ROLE_COLUMNS = ['Owner', 'Admin', 'User'];
export const ROLE_PERMISSION_ROWS = [
	{
		label: 'See a project’s tests, reports and runs',
		cells: ['all projects', 'assigned', 'assigned']
	},
	{
		label: 'Run tests and manage the test repository',
		cells: ['all projects', 'assigned', 'assigned']
	},
	{
		label: 'Project settings (name, logo, integrations, MCP, members)',
		cells: ['all projects', 'assigned', '—']
	},
	{ label: 'Create and delete projects', cells: ['✓', '—', '—'] },
	{ label: 'Manage users, runners and backups', cells: ['✓', '—', '—'] }
];
