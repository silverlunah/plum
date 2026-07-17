/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { SAVING_LABEL, SAVE_LABEL } from './common';

export const PAGE_TITLE = 'Settings — Plum';
export const HEADING = 'Settings';

export const NAME_LABEL = 'Name';
export const NETWORK_ERROR = 'Network error';

const CHECKING_LABEL = 'Checking…';
const COPIED_LABEL = 'Copied!';

// ── Nav / section labels ──
export const PROJECT_LABEL = 'Project';
export const RUNNERS_LABEL = 'Runners';
export const REPOSITORY_NAV_LABEL = 'Repository';
export const REPOSITORY_HEADING = 'Test Repository';
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
	'Generate an API key for any MCP-compatible AI client — Claude, Cursor, Windsurf, and others.';
export const ACCOUNT_DESC = 'Manage your profile, credentials and session.';
export const USERS_DESC = 'Add and manage who can access Plum.';
export const BACKUP_DESC =
	'Export your test cases, schedules, users, and project settings. Automate uploads to any S3-compatible storage — Cloudflare R2, Backblaze B2, AWS S3, or MinIO.';

// ── Runner requests / toasts ──
export const RUNNER_FIELDS_REQUIRED_ERROR = 'Name, URL and token are required.';
export const ADD_RUNNER_FAILED = 'Failed to add runner.';
export const REMOVE_RUNNER_FAILED = 'Failed to remove runner.';
export const UPDATE_RUNNER_FAILED = 'Failed to update runner.';

export const cannotReachRunnerError = (error) =>
	`Cannot reach this runner — ${error ?? 'check the URL and token'}.`;
export const runnerAddedToast = (name) => `Runner "${name}" added.`;
export const runnerRemovedToast = (name) => `Runner "${name}" removed.`;
export const runnerStoppedToast = (name) => `Runner "${name}" stopped.`;
export const runnerStopFailedToast = (name, error) =>
	`Could not stop "${name}": ${error ?? 'unknown error'}`;
export const runnerStopFailedGenericToast = (name) => `Could not stop "${name}".`;
export const runnerRestartingToast = (name) => `Runner "${name}" restarting…`;
export const runnerRestartFailedToast = (name, error) =>
	`Could not restart "${name}": ${error ?? 'unknown error'}`;
export const runnerRestartFailedGenericToast = (name) => `Could not restart "${name}".`;
export const runnerUpdatedToast = (name) => `Runner "${name}" updated.`;

// ── Project ──
export const PROJECT_NAME_LABEL = 'Project Name';
export const PROJECT_NAME_PLACEHOLDER = 'My Test Suite';
export const LOGO_URL_LABEL = 'Logo URL';
export const LOGO_URL_HINT = 'Direct link to an image (PNG, SVG, JPG)';
export const LOGO_URL_PLACEHOLDER = 'https://example.com/logo.png';
export const PREVIEW_LABEL = 'Preview';
export const LOGO_PREVIEW_ALT = 'Project logo preview';
export const TIMEZONE_LABEL = 'Timezone';
export const TIMEZONE_HINT = 'Used to schedule cron jobs and backups';
export const RETRY_FAILED_TESTS_LABEL = 'Retry failed tests';
export const RETRY_FAILED_TESTS_HINT =
	'Automatically re-run failed scenarios up to this many times before finalizing the report. 0 disables retries.';
export const DARK_MODE_LABEL = 'Dark mode';
export const DARK_MODE_DESC = 'Switch between light and dark appearance';
export const PROJECT_SAVED_TOAST = 'Project settings saved.';
export const PROJECT_SAVE_FAILED = 'Failed to save project settings.';

export const saveProjectLabel = (saving) => (saving ? SAVING_LABEL : 'Save Project');

// ── Runners ──
export const BUILTIN_RUNNER_TOGGLE_LABEL = 'Built-in runner';
export const BUILTIN_RUNNER_TOGGLE_DESC =
	'Use this server to run tests locally. Disable to route all runs to external nodes.';
export const RUNNER_URL_LABEL = 'URL';
export const RUNNER_URL_HINT_PREFIX = 'Use';
export const RUNNER_URL_HINT_SUFFIX = 'for local nodes';
export const RUNNER_URL_PLACEHOLDER = 'http://host.docker.internal:3002';
export const TOKEN_LABEL = 'Token';
export const TOKEN_PLACEHOLDER = 'secret-token';
export const KEEP_TOKEN_PLACEHOLDER = 'Leave blank to keep current token';
export const BROWSER_LABEL = 'Browser';
export const RUNNER_NAME_PLACEHOLDER = 'staging-node';
export const RUNNER_UNREACHABLE_LABEL = 'unreachable';
export const RUNNER_PINGING_LABEL = 'pinging…';
export const REMOVE_LABEL = 'Remove';
export const ADD_RUNNER_FORM_TITLE = 'Add runner';
export const OPEN_ADD_RUNNER_LABEL = '+ Add Runner';

const RESTART_LABEL = 'Restart';
const RESTARTING_LABEL = 'Restarting…';
const STOP_LABEL = 'Stop';
const STOPPING_LABEL = 'Stopping…';
const ADD_RUNNER_LABEL = 'Add Runner';

export const editRunnerSubmitLabel = (saving) => (saving ? CHECKING_LABEL : SAVE_LABEL);
export const addRunnerSubmitLabel = (saving) => (saving ? CHECKING_LABEL : ADD_RUNNER_LABEL);
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
	'Base URL of this Plum instance, used to link reports in notifications';
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
export const API_KEY_CARD_TITLE = 'API Key';
export const NO_KEY_GENERATED_MESSAGE = 'No key generated yet.';
export const HIDE_KEY_TITLE = 'Hide key';
export const SHOW_KEY_TITLE = 'Show key';
export const COPY_KEY_TITLE = 'Copy key';
export const MCP_REGEN_NOTE = 'Regenerating invalidates the existing key immediately.';
export const CONFIG_SNIPPET_CARD_TITLE = 'Config Snippet';
export const CONFIG_SNIPPET_DESC_PREFIX = "Add this to your MCP client's config file (e.g.";
export const CONFIG_SNIPPET_DESC_SUFFIX = ', Cursor MCP settings, etc.).';
export const MCP_KEY_GENERATED_TOAST = 'MCP key generated.';
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
export const USER_NAME_PLACEHOLDER = 'Jane Smith';
export const USER_EMAIL_PLACEHOLDER = 'jane@example.com';
export const PASSWORD_LABEL = 'Password';
export const ROLE_LABEL = 'Role';
export const USER_ROLE_OPTION = 'User';
export const ADMIN_ROLE_OPTION = 'Admin';
export const REMOVE_USER_ICON_TITLE = 'Remove user';
export const YOU_CHIP_LABEL = 'you';
export const USER_FORM_REQUIRED_ERROR = 'Name, email and password are required.';

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
export const BACKUP_DISCLAIMER_PREFIX =
	'Reports are not included in backups. To back up report history, run';
export const BACKUP_DISCLAIMER_SUFFIX = 'directly on the PostgreSQL volume.';

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

export const SCHEDULED_BACKUP_CARD_TITLE = 'Scheduled Backup';
export const CONFIGURE_S3_FIRST_MESSAGE = 'Configure S3 storage above to enable scheduled backups.';
export const ENABLE_SCHEDULED_BACKUP_LABEL = 'Enable scheduled backup';
export const CRON_EXPRESSION_LABEL = 'Cron Expression';
export const CRON_HINT_PREFIX = '5-field cron — e.g.';
export const CRON_HINT_SUFFIX = '= daily at 2 AM.';
export const CRONTAB_LINK_LABEL = 'Test at crontab.guru ↗';
export const CRON_PLACEHOLDER = '0 2 * * *';
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
