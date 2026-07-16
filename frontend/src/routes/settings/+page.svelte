<!--
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
 -->

<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import {
		fetchProject,
		saveProject,
		exportBackup,
		importBackup,
		fetchIntegrations,
		saveIntegrations,
		fetchBackupConfig,
		saveBackupConfig,
		testBackupS3,
		runBackupNow,
		fetchMcpConfig,
		generateMcpKey as generateMcpKeyApi
	} from '$lib/api/settings';
	import {
		fetchRunners,
		createRunner,
		updateRunner,
		deleteRunner,
		pingRunner,
		probeRunner,
		stopRunner,
		restartRunner
	} from '$lib/api/runners';
	import { fetchPrefixes, savePrefixes, migratePrefixes } from '$lib/api/repository';
	import { updateProfile, changePassword } from '$lib/api/auth';
	import {
		fetchUsers,
		createUser as createUserApi,
		deleteUser as deleteUserApi
	} from '$lib/api/users';
	import { builtInEnabled } from '$lib/stores/runner';
	import { auth } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
	import {
		API_BASE,
		BROWSERS,
		TOAST_TIMEOUT_MS,
		MAX_TEST_RETRIES,
		COPY_TIMEOUT_MS
	} from '$lib/constants';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { CANCEL_LABEL, EDIT_LABEL, SAVE_LABEL, EMAIL_LABEL } from '$lib/copy/common';
	import {
		PAGE_TITLE,
		HEADING,
		NAME_LABEL,
		NETWORK_ERROR,
		PROJECT_LABEL,
		RUNNERS_LABEL,
		REPOSITORY_NAV_LABEL,
		REPOSITORY_HEADING,
		INTEGRATIONS_LABEL,
		MCP_NAV_LABEL,
		MCP_HEADING,
		ACCOUNT_LABEL,
		USERS_LABEL,
		BACKUP_LABEL,
		PROJECT_DESC,
		RUNNERS_DESC,
		REPOSITORY_DESC,
		INTEGRATIONS_DESC,
		MCP_DESC,
		ACCOUNT_DESC,
		USERS_DESC,
		BACKUP_DESC,
		RUNNER_FIELDS_REQUIRED_ERROR,
		ADD_RUNNER_FAILED,
		REMOVE_RUNNER_FAILED,
		UPDATE_RUNNER_FAILED,
		cannotReachRunnerError,
		runnerAddedToast,
		runnerRemovedToast,
		runnerStoppedToast,
		runnerStopFailedToast,
		runnerStopFailedGenericToast,
		runnerRestartingToast,
		runnerRestartFailedToast,
		runnerRestartFailedGenericToast,
		runnerUpdatedToast,
		PROJECT_NAME_LABEL,
		PROJECT_NAME_PLACEHOLDER,
		LOGO_URL_LABEL,
		LOGO_URL_HINT,
		LOGO_URL_PLACEHOLDER,
		PREVIEW_LABEL,
		LOGO_PREVIEW_ALT,
		TIMEZONE_LABEL,
		TIMEZONE_HINT,
		RETRY_FAILED_TESTS_LABEL,
		RETRY_FAILED_TESTS_HINT,
		DARK_MODE_LABEL,
		DARK_MODE_DESC,
		PROJECT_SAVED_TOAST,
		PROJECT_SAVE_FAILED,
		saveProjectLabel,
		BUILTIN_RUNNER_TOGGLE_LABEL,
		BUILTIN_RUNNER_TOGGLE_DESC,
		RUNNER_URL_LABEL,
		RUNNER_URL_HINT_PREFIX,
		RUNNER_URL_HINT_SUFFIX,
		RUNNER_URL_PLACEHOLDER,
		TOKEN_LABEL,
		TOKEN_PLACEHOLDER,
		KEEP_TOKEN_PLACEHOLDER,
		BROWSER_LABEL,
		RUNNER_NAME_PLACEHOLDER,
		RUNNER_UNREACHABLE_LABEL,
		RUNNER_PINGING_LABEL,
		REMOVE_LABEL,
		ADD_RUNNER_FORM_TITLE,
		OPEN_ADD_RUNNER_LABEL,
		editRunnerSubmitLabel,
		addRunnerSubmitLabel,
		restartRunnerLabel,
		stopRunnerLabel,
		CASE_PREFIX_LABEL,
		CASE_PREFIX_PLACEHOLDER,
		SUITE_PREFIX_LABEL,
		SUITE_PREFIX_PLACEHOLDER,
		EXAMPLES_LABEL,
		PREFIXES_SAVED_TOAST,
		PREFIXES_SAVE_FAILED,
		MIGRATE_IDS_HEADING,
		MIGRATE_DESC_PREFIX,
		MIGRATE_DESC_STRONG,
		MIGRATE_DESC_SUFFIX,
		NEW_CASE_PREFIX_LABEL,
		NEW_SUITE_PREFIX_LABEL,
		MIGRATION_COMPLETE_TOAST,
		MIGRATION_FAILED_TOAST,
		savePrefixesLabel,
		runMigrationLabel,
		WEBHOOKS_CARD_TITLE,
		DISCORD_WEBHOOK_LABEL,
		DISCORD_WEBHOOK_HINT,
		DISCORD_WEBHOOK_PLACEHOLDER,
		SLACK_WEBHOOK_LABEL,
		SLACK_WEBHOOK_HINT,
		SLACK_WEBHOOK_PLACEHOLDER,
		PUBLIC_URL_LABEL,
		PUBLIC_URL_HINT,
		PUBLIC_URL_PLACEHOLDER,
		INTEGRATIONS_SAVED_TOAST,
		INTEGRATIONS_SAVE_FAILED,
		CI_TRIGGERS_CARD_TITLE,
		CI_DESC_PART1,
		CI_DESC_PART2,
		CI_DESC_PART3,
		MCP_TAB_LINK_LABEL,
		CI_DESC_PART4,
		EXTERNAL_BADGE_LABEL,
		saveIntegrationsLabel,
		copyCiSnippetLabel,
		API_KEY_CARD_TITLE,
		NO_KEY_GENERATED_MESSAGE,
		HIDE_KEY_TITLE,
		SHOW_KEY_TITLE,
		COPY_KEY_TITLE,
		MCP_REGEN_NOTE,
		CONFIG_SNIPPET_CARD_TITLE,
		CONFIG_SNIPPET_DESC_PREFIX,
		CONFIG_SNIPPET_DESC_SUFFIX,
		MCP_KEY_GENERATED_TOAST,
		MCP_KEY_GENERATE_FAILED,
		generateKeyLabel,
		regenerateKeyLabel,
		copyMcpSnippetLabel,
		PROFILE_CARD_TITLE,
		CHANGE_PASSWORD_CARD_TITLE,
		CURRENT_PASSWORD_LABEL,
		NEW_PASSWORD_LABEL,
		CONFIRM_NEW_PASSWORD_LABEL,
		SIGN_OUT_LABEL,
		PROFILE_UPDATED_TOAST,
		PASSWORDS_NO_MATCH_ERROR,
		PASSWORD_TOO_SHORT_ERROR,
		PASSWORD_CHANGED_TOAST,
		saveProfileLabel,
		changePasswordLabel,
		REMOVE_USER_MODAL_TITLE,
		REMOVE_USER_LABEL,
		REMOVE_USER_BODY_PREFIX,
		REMOVE_USER_BODY_SUFFIX,
		ADD_USER_CARD_TITLE,
		USER_NAME_PLACEHOLDER,
		USER_EMAIL_PLACEHOLDER,
		PASSWORD_LABEL,
		ROLE_LABEL,
		USER_ROLE_OPTION,
		ADMIN_ROLE_OPTION,
		REMOVE_USER_ICON_TITLE,
		YOU_CHIP_LABEL,
		USER_FORM_REQUIRED_ERROR,
		addUserLabel,
		userAddedToast,
		userRemovedToast,
		MANUAL_BACKUP_CARD_TITLE,
		EXPORT_BLOCK_TITLE,
		EXPORT_BLOCK_DESC_PREFIX,
		EXPORT_BLOCK_DESC_SUFFIX,
		IMPORT_BLOCK_TITLE,
		IMPORT_BLOCK_DESC,
		CHOOSE_FILE_LABEL,
		BACKUP_DISCLAIMER_PREFIX,
		BACKUP_DISCLAIMER_SUFFIX,
		S3_STORAGE_CARD_TITLE,
		S3_STORAGE_DESC_PREFIX,
		ENDPOINT_URL_LABEL,
		S3_STORAGE_DESC_SUFFIX,
		ENDPOINT_URL_HINT,
		ENDPOINT_URL_PLACEHOLDER,
		REGION_LABEL,
		REGION_HINT_PREFIX,
		REGION_HINT_SUFFIX,
		REGION_PLACEHOLDER,
		BUCKET_LABEL,
		BUCKET_PLACEHOLDER,
		PATH_PREFIX_LABEL,
		PATH_PREFIX_HINT,
		PATH_PREFIX_PLACEHOLDER,
		ACCESS_KEY_LABEL,
		ACCESS_KEY_PLACEHOLDER,
		SECRET_KEY_LABEL,
		TEST_CONNECTION_LABEL,
		SAVE_S3_CONFIG_LABEL,
		S3_CONNECTION_SUCCESS,
		S3_CONNECTION_FAILED,
		BACKUP_CONFIG_SAVED_TOAST,
		BACKUP_CONFIG_SAVE_FAILED,
		SCHEDULED_BACKUP_CARD_TITLE,
		CONFIGURE_S3_FIRST_MESSAGE,
		ENABLE_SCHEDULED_BACKUP_LABEL,
		CRON_EXPRESSION_LABEL,
		CRON_HINT_PREFIX,
		CRON_HINT_SUFFIX,
		CRONTAB_LINK_LABEL,
		CRON_PLACEHOLDER,
		BACKUP_LAST_RUN_PREFIX,
		BACKUP_DOWNLOADED_TOAST,
		EXPORT_FAILED_TOAST,
		IMPORT_SUCCESS_TOAST,
		IMPORT_FAILED_FALLBACK,
		BACKUP_UPLOAD_SUCCESS_TOAST,
		BACKUP_UPLOAD_FAILED_FALLBACK,
		backupFilename,
		exportLabel,
		importLabel,
		secretKeyHint,
		secretKeyPlaceholder,
		testConnectionLabel,
		saveS3ConfigLabel,
		uploadedToLabel,
		uploadS3NowLabel,
		saveScheduleLabel
	} from '$lib/copy/settings';

	/** @type {'project' | 'runners' | 'repository' | 'integrations' | 'mcp' | 'account' | 'users' | 'backup'} */
	let section =
		(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('plum:settings:section')) ||
		'project';

	function setSection(s) {
		section = s;
		try {
			sessionStorage.setItem('plum:settings:section', s);
		} catch {}
	}

	let project = { name: '', logoUrl: '', timezone: 'UTC', maxRetries: 0 };
	let projectSaving = false;
	let toast = null;

	const TIMEZONES = (() => {
		try {
			return Intl.supportedValuesOf('timeZone');
		} catch {
			return ['UTC'];
		}
	})();

	let prefixes = { testCasePrefix: 'TC', testSuitePrefix: 'TS' };
	let prefixesSaving = false;
	let migrateForm = { testCasePrefix: '', testSuitePrefix: '' };
	let migrating = false;

	let profileForm = { name: '', email: '' };
	let profileSaving = false;
	let profileError = '';

	let allUsers = [];
	let userForm = { name: '', email: '', password: '', role: 'user' };
	let userFormSaving = false;
	let userFormError = '';
	let confirmDeleteUser = null;
	let confirmDeleteUserOpen = false;

	let pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
	let pwSaving = false;
	let pwError = '';

	let importFile = null;
	let importing = false;
	let exporting = false;
	let fileInput;

	let integrations = { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	let integrationsSaving = false;

	let mcpKey = '';
	let mcpKeySet = false;
	let mcpShowKey = false;
	let mcpGenerating = false;
	let mcpKeyCopied = false;
	let mcpSnippetCopied = false;
	let ciSnippetCopied = false;

	let backupConfig = {
		backupEnabled: false,
		backupCron: '0 2 * * *',
		backupS3Endpoint: '',
		backupS3Region: '',
		backupS3Bucket: '',
		backupS3AccessKey: '',
		backupS3SecretKey: '',
		backupS3Prefix: ''
	};
	let backupConfigSaving = false;
	let backupS3SecretKeySet = false;
	let backupTestingS3 = false;
	let backupRunningNow = false;
	let backupS3TestResult = null;
	let backupS3TestMessage = '';
	let backupLastRunAt = null;
	let backupLastStatus = '';

	let runners = [];
	let runnerForm = { name: '', url: '', token: '', browser: 'chromium' };
	let runnerFormError = '';
	let runnerFormSaving = false;
	let runnerFormOpen = false;
	let pingResults = {};
	let stoppingId = null;
	let restartingId = null;
	let editingId = null;
	let editForm = { name: '', url: '', token: '', browser: 'chromium' };
	let editFormError = '';
	let editFormSaving = false;

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	let runnersLoaded = false;

	onMount(async () => {
		try {
			const bi = localStorage.getItem('plum:builtInEnabled');
			if (bi !== null) builtInEnabled.set(bi !== 'false');
		} catch {}
		try {
			project = await fetchProject();
		} catch {}
		try {
			runners = await fetchRunners();
			runnersLoaded = true;
		} catch {}
		try {
			prefixes = await fetchPrefixes();
			migrateForm = {
				testCasePrefix: prefixes.testCasePrefix,
				testSuitePrefix: prefixes.testSuitePrefix
			};
		} catch {}
		try {
			integrations = await fetchIntegrations();
		} catch {}
		try {
			const mcp = await fetchMcpConfig();
			mcpKeySet = mcp.mcpKeySet;
			mcpKey = mcp.mcpKey;
		} catch {}
		try {
			const bc = await fetchBackupConfig();
			backupS3SecretKeySet = bc.backupS3SecretKeySet;
			backupLastRunAt = bc.backupLastRunAt;
			backupLastStatus = bc.backupLastStatus;
			backupConfig = {
				backupEnabled: bc.backupEnabled,
				backupCron: bc.backupCron,
				backupS3Endpoint: bc.backupS3Endpoint,
				backupS3Region: bc.backupS3Region,
				backupS3Bucket: bc.backupS3Bucket,
				backupS3AccessKey: bc.backupS3AccessKey,
				backupS3SecretKey: '',
				backupS3Prefix: bc.backupS3Prefix
			};
		} catch {}
		if ($auth.user) {
			profileForm = { name: $auth.user.name, email: $auth.user.email };
		}
		if ($auth.user?.role === 'admin') {
			try {
				allUsers = await fetchUsers();
			} catch {}
		}
	});

	$: if (section === 'runners' && runnersLoaded) pingAll();

	async function pingAll() {
		if (runners.length === 0) return;
		pingResults = Object.fromEntries(runners.map((r) => [r.id, { loading: true }]));
		await Promise.all(
			runners.map(async (r) => {
				try {
					const result = await pingRunner(r.id);
					pingResults = { ...pingResults, [r.id]: { ...result, loading: false } };
				} catch {
					pingResults = {
						...pingResults,
						[r.id]: { ok: false, error: NETWORK_ERROR, loading: false }
					};
				}
			})
		);
	}

	function handleBuiltInToggle() {
		builtInEnabled.update((v) => {
			const next = !v;
			try {
				localStorage.setItem('plum:builtInEnabled', String(next));
			} catch {}
			return next;
		});
	}

	function toggleTheme() {
		theme.update((t) => (t === 'light' ? 'dark' : 'light'));
	}

	async function handleAddRunner() {
		if (!runnerForm.name || !runnerForm.url || !runnerForm.token) {
			runnerFormError = RUNNER_FIELDS_REQUIRED_ERROR;
			return;
		}
		runnerFormError = '';
		runnerFormSaving = true;
		try {
			const probe = await probeRunner(runnerForm.url, runnerForm.token);
			if (!probe.ok) {
				runnerFormError = cannotReachRunnerError(probe.error);
				return;
			}
			const { runner } = await createRunner(runnerForm);
			runners = [...runners, runner];
			pingResults = {
				...pingResults,
				[runner.id]: { ok: true, latency: probe.latency, loading: false }
			};
			runnerForm = { name: '', url: '', token: '', browser: 'chromium' };
			runnerFormOpen = false;
			showToast('success', runnerAddedToast(runner.name));
		} catch {
			runnerFormError = ADD_RUNNER_FAILED;
		} finally {
			runnerFormSaving = false;
		}
	}

	async function handleDeleteRunner(id, name) {
		try {
			await deleteRunner(id);
			runners = runners.filter((r) => r.id !== id);
			showToast('success', runnerRemovedToast(name));
		} catch {
			showToast('error', REMOVE_RUNNER_FAILED);
		}
	}

	async function refreshPing(id) {
		pingResults = { ...pingResults, [id]: { loading: true } };
		try {
			const result = await pingRunner(id);
			pingResults = { ...pingResults, [id]: { ...result, loading: false } };
		} catch {
			pingResults = { ...pingResults, [id]: { ok: false, error: NETWORK_ERROR, loading: false } };
		}
	}

	async function handleStopRunner(id, name) {
		stoppingId = id;
		try {
			const result = await stopRunner(id);
			if (result.ok) {
				showToast('success', runnerStoppedToast(name));
			} else {
				showToast('error', runnerStopFailedToast(name, result.error));
			}
		} catch {
			showToast('error', runnerStopFailedGenericToast(name));
		} finally {
			stoppingId = null;
			refreshPing(id);
		}
	}

	async function handleRestartRunner(id, name) {
		restartingId = id;
		try {
			const result = await restartRunner(id);
			if (result.ok) {
				showToast('success', runnerRestartingToast(name));
			} else {
				showToast('error', runnerRestartFailedToast(name, result.error));
			}
		} catch {
			showToast('error', runnerRestartFailedGenericToast(name));
		} finally {
			restartingId = null;
			// Give the replacement process a moment to bind before checking on it.
			setTimeout(() => refreshPing(id), 2000);
		}
	}

	function startEdit(r) {
		editingId = r.id;
		// Token is never sent back by the server — leave blank; the update
		// only replaces it if the admin types a new one (see handleUpdateRunner).
		editForm = { name: r.name, url: r.url, token: '', browser: r.browser };
		editFormError = '';
	}

	async function handleUpdateRunner(id) {
		if (!editForm.name || !editForm.url) {
			editFormError = RUNNER_FIELDS_REQUIRED_ERROR;
			return;
		}
		editFormError = '';
		editFormSaving = true;
		try {
			// Only re-probe (and require a reachable token) when the admin actually
			// typed a new one — an empty token here means "keep the existing one",
			// which the still-running node already accepts.
			if (editForm.token) {
				const probe = await probeRunner(editForm.url, editForm.token);
				if (!probe.ok) {
					editFormError = cannotReachRunnerError(probe.error);
					return;
				}
				pingResults = {
					...pingResults,
					[id]: { ok: true, latency: probe.latency, loading: false }
				};
			}
			const { runner } = await updateRunner(id, editForm);
			runners = runners.map((r) => (r.id === id ? runner : r));
			editingId = null;
			showToast('success', runnerUpdatedToast(runner.name));
		} catch {
			editFormError = UPDATE_RUNNER_FAILED;
		} finally {
			editFormSaving = false;
		}
	}

	async function handleSaveProject() {
		projectSaving = true;
		try {
			await saveProject(project);
			showToast('success', PROJECT_SAVED_TOAST);
		} catch {
			showToast('error', PROJECT_SAVE_FAILED);
		} finally {
			projectSaving = false;
		}
	}

	async function handleExport() {
		exporting = true;
		try {
			const data = await exportBackup();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = backupFilename(new Date().toISOString().slice(0, 10));
			a.click();
			URL.revokeObjectURL(url);
			showToast('success', BACKUP_DOWNLOADED_TOAST);
		} catch {
			showToast('error', EXPORT_FAILED_TOAST);
		} finally {
			exporting = false;
		}
	}

	async function handleImport() {
		if (!importFile) return;
		importing = true;
		try {
			const text = await importFile.text();
			const data = JSON.parse(text);
			const result = await importBackup(data);
			if (result.error) throw new Error(result.error);
			showToast('success', IMPORT_SUCCESS_TOAST);
			project = await fetchProject();
			importFile = null;
			if (fileInput) fileInput.value = '';
		} catch (e) {
			showToast('error', e.message || IMPORT_FAILED_FALLBACK);
		} finally {
			importing = false;
		}
	}

	function handleFileChange(e) {
		importFile = e.target.files[0] ?? null;
	}

	async function handleSavePrefixes() {
		prefixesSaving = true;
		try {
			prefixes = await savePrefixes(prefixes);
			showToast('success', PREFIXES_SAVED_TOAST);
		} catch {
			showToast('error', PREFIXES_SAVE_FAILED);
		} finally {
			prefixesSaving = false;
		}
	}

	async function handleMigratePrefixes() {
		migrating = true;
		try {
			await migratePrefixes(migrateForm);
			prefixes = { ...prefixes, ...migrateForm };
			showToast('success', MIGRATION_COMPLETE_TOAST);
		} catch {
			showToast('error', MIGRATION_FAILED_TOAST);
		} finally {
			migrating = false;
		}
	}

	async function handleUpdateProfile() {
		profileError = '';
		profileSaving = true;
		try {
			const { user } = await updateProfile({
				token: $auth.token,
				name: profileForm.name,
				email: profileForm.email
			});
			auth.login($auth.token, { ...$auth.user, ...user });
			showToast('success', PROFILE_UPDATED_TOAST);
		} catch (e) {
			profileError = e.message;
		} finally {
			profileSaving = false;
		}
	}

	async function handleCreateUser() {
		userFormError = '';
		if (!userForm.name || !userForm.email || !userForm.password) {
			userFormError = USER_FORM_REQUIRED_ERROR;
			return;
		}
		userFormSaving = true;
		try {
			const user = await createUserApi(userForm);
			allUsers = [...allUsers, user];
			userForm = { name: '', email: '', password: '', role: 'user' };
			showToast('success', userAddedToast(user.name));
		} catch (e) {
			userFormError = e.message;
		} finally {
			userFormSaving = false;
		}
	}

	async function handleDeleteUser(id, name) {
		try {
			await deleteUserApi(id);
			allUsers = allUsers.filter((u) => u.id !== id);
			showToast('success', userRemovedToast(name));
		} catch (e) {
			showToast('error', e.message);
		}
		confirmDeleteUser = null;
		confirmDeleteUserOpen = false;
	}

	async function handleChangePassword() {
		pwError = '';
		if (pwForm.newPassword !== pwForm.confirmPassword) {
			pwError = PASSWORDS_NO_MATCH_ERROR;
			return;
		}
		if (pwForm.newPassword.length < 8) {
			pwError = PASSWORD_TOO_SHORT_ERROR;
			return;
		}
		pwSaving = true;
		try {
			await changePassword({
				token: $auth.token,
				currentPassword: pwForm.currentPassword,
				newPassword: pwForm.newPassword
			});
			pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
			showToast('success', PASSWORD_CHANGED_TOAST);
		} catch (e) {
			pwError = e.message;
		} finally {
			pwSaving = false;
		}
	}

	function handleLogout() {
		auth.logout();
		goto('/login');
	}

	async function handleGenerateMcpKey() {
		mcpGenerating = true;
		try {
			const result = await generateMcpKeyApi();
			mcpKey = result.mcpKey;
			mcpKeySet = true;
			mcpShowKey = true;
			showToast('success', MCP_KEY_GENERATED_TOAST);
		} catch {
			showToast('error', MCP_KEY_GENERATE_FAILED);
		} finally {
			mcpGenerating = false;
		}
	}

	function handleCopyMcpKey() {
		navigator.clipboard.writeText(mcpKey).then(() => {
			mcpKeyCopied = true;
			setTimeout(() => (mcpKeyCopied = false), COPY_TIMEOUT_MS);
		});
	}

	function handleCopyMcpSnippet() {
		navigator.clipboard.writeText(mcpConfigSnippet).then(() => {
			mcpSnippetCopied = true;
			setTimeout(() => (mcpSnippetCopied = false), COPY_TIMEOUT_MS);
		});
	}

	function handleCopyCiSnippet() {
		navigator.clipboard.writeText(ciWorkflowSnippet).then(() => {
			ciSnippetCopied = true;
			setTimeout(() => (ciSnippetCopied = false), COPY_TIMEOUT_MS);
		});
	}

	async function handleSaveIntegrations() {
		integrationsSaving = true;
		try {
			integrations = await saveIntegrations(integrations);
			showToast('success', INTEGRATIONS_SAVED_TOAST);
		} catch {
			showToast('error', INTEGRATIONS_SAVE_FAILED);
		} finally {
			integrationsSaving = false;
		}
	}

	async function handleSaveBackupConfig() {
		backupConfigSaving = true;
		try {
			const payload = { ...backupConfig };
			if (!payload.backupS3SecretKey) delete payload.backupS3SecretKey;
			const result = await saveBackupConfig(payload);
			if (result.error) throw new Error(result.error);
			if (backupConfig.backupS3SecretKey) backupS3SecretKeySet = true;
			backupConfig = { ...backupConfig, backupS3SecretKey: '' };
			showToast('success', BACKUP_CONFIG_SAVED_TOAST);
		} catch (e) {
			showToast('error', e.message || BACKUP_CONFIG_SAVE_FAILED);
		} finally {
			backupConfigSaving = false;
		}
	}

	async function handleTestS3() {
		backupTestingS3 = true;
		backupS3TestResult = null;
		backupS3TestMessage = '';
		try {
			const result = await testBackupS3(backupConfig);
			if (result.error) throw new Error(result.error);
			backupS3TestResult = 'success';
			backupS3TestMessage = S3_CONNECTION_SUCCESS;
		} catch (e) {
			backupS3TestResult = 'error';
			backupS3TestMessage = e.message || S3_CONNECTION_FAILED;
		} finally {
			backupTestingS3 = false;
		}
	}

	async function handleRunBackupNow() {
		backupRunningNow = true;
		try {
			const result = await runBackupNow();
			if (result.error) throw new Error(result.error);
			backupLastRunAt = result.lastRunAt;
			backupLastStatus = result.lastStatus ?? '';
			showToast('success', BACKUP_UPLOAD_SUCCESS_TOAST);
		} catch (e) {
			showToast('error', e.message || BACKUP_UPLOAD_FAILED_FALLBACK);
			const bc = await fetchBackupConfig().catch(() => null);
			if (bc) {
				backupLastRunAt = bc.backupLastRunAt;
				backupLastStatus = bc.backupLastStatus;
			}
		} finally {
			backupRunningNow = false;
		}
	}

	$: s3Configured = !!(
		backupConfig.backupS3Bucket &&
		backupConfig.backupS3AccessKey &&
		backupS3SecretKeySet
	);

	$: mcpConfigSnippet = JSON.stringify(
		{
			mcpServers: {
				plum: {
					command: 'plum',
					args: ['mcp'],
					env: {
						PLUM_API_URL: API_BASE,
						PLUM_API_KEY: mcpKey
					}
				}
			}
		},
		null,
		2
	);

	$: ciWorkflowSnippet = [
		'- name: Run Plum tests',
		'  run: |',
		`    curl -X POST ${API_BASE}/trigger \\`,
		'      -H "Authorization: ApiKey ${{ secrets.PLUM_API_KEY }}" \\',
		'      -H "Content-Type: application/json" \\',
		'      -d \'{"tag": "@smoke", "baseUrl": "https://your-pr-preview-url"}\''
	].join('\n');

	const ADMIN_SECTIONS = new Set([
		'project',
		'runners',
		'repository',
		'integrations',
		'mcp',
		'users',
		'backup'
	]);

	$: if ($auth.user && $auth.user.role !== 'admin' && ADMIN_SECTIONS.has(section)) {
		section = 'account';
	}

	$: navItems =
		$auth.user?.role === 'admin'
			? [
					{ id: 'project', label: PROJECT_LABEL },
					{ id: 'runners', label: RUNNERS_LABEL },
					{ id: 'repository', label: REPOSITORY_NAV_LABEL },
					{ id: 'integrations', label: INTEGRATIONS_LABEL },
					{ id: 'mcp', label: MCP_NAV_LABEL },
					{ id: 'account', label: ACCOUNT_LABEL },
					{ id: 'users', label: USERS_LABEL },
					{ id: 'backup', label: BACKUP_LABEL }
				]
			: [{ id: 'account', label: ACCOUNT_LABEL }];
</script>

<svelte:head><title>{PAGE_TITLE}</title></svelte:head>

<Toast {toast} />

<div class="page-header">
	<h1>{HEADING}</h1>
</div>

<div class="settings-layout">
	<!-- Left sidebar -->
	<aside class="settings-sidebar">
		<nav>
			{#each navItems as item}
				<button
					class="sidebar-item"
					class:active={section === item.id}
					on:click={() => setSection(item.id)}
				>
					{item.label}
				</button>
			{/each}
		</nav>
	</aside>

	<!-- Right content -->
	<div class="settings-content">
		<!-- PROJECT -->
		{#if section === 'project'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{PROJECT_LABEL}</h2>
					<p class="content-desc">{PROJECT_DESC}</p>
				</div>

				<div class="card settings-card">
					<div class="field">
						<label class="field-label" for="project-name">{PROJECT_NAME_LABEL}</label>
						<input
							id="project-name"
							type="text"
							class="field-input"
							bind:value={project.name}
							placeholder={PROJECT_NAME_PLACEHOLDER}
						/>
					</div>

					<div class="field">
						<label class="field-label" for="project-logo">
							<span>{LOGO_URL_LABEL}</span>
							<span class="field-hint">{LOGO_URL_HINT}</span>
						</label>
						<input
							id="project-logo"
							type="url"
							class="field-input"
							bind:value={project.logoUrl}
							placeholder={LOGO_URL_PLACEHOLDER}
						/>
					</div>

					{#if project.logoUrl}
						<div class="logo-preview">
							<span class="preview-label">{PREVIEW_LABEL}</span>
							<img
								src={project.logoUrl}
								alt={LOGO_PREVIEW_ALT}
								class="logo-img"
								on:error={(e) => (e.target.style.display = 'none')}
							/>
						</div>
					{/if}

					<div class="field">
						<label class="field-label" for="project-timezone">
							<span>{TIMEZONE_LABEL}</span>
							<span class="field-hint">{TIMEZONE_HINT}</span>
						</label>
						<select id="project-timezone" class="field-input" bind:value={project.timezone}>
							{#each TIMEZONES as tz}
								<option value={tz}>{tz}</option>
							{/each}
						</select>
					</div>

					<div class="field">
						<label class="field-label" for="project-max-retries">
							<span>{RETRY_FAILED_TESTS_LABEL}</span>
							<span class="field-hint">
								{RETRY_FAILED_TESTS_HINT}
							</span>
						</label>
						<input
							id="project-max-retries"
							type="number"
							class="field-input"
							min="0"
							max={MAX_TEST_RETRIES}
							bind:value={project.maxRetries}
						/>
					</div>

					<!-- Dark mode toggle -->
					<div class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-label">{DARK_MODE_LABEL}</span>
							<span class="toggle-desc">{DARK_MODE_DESC}</span>
						</div>
						<button
							class="toggle-switch"
							class:on={$theme === 'dark'}
							role="switch"
							aria-checked={$theme === 'dark'}
							on:click={toggleTheme}
						>
							<span class="toggle-thumb"></span>
						</button>
					</div>

					<div class="card-footer">
						<Button on:click={handleSaveProject} disabled={projectSaving}>
							{saveProjectLabel(projectSaving)}
						</Button>
					</div>
				</div>
			</div>

			<!-- RUNNERS -->
		{:else if section === 'runners'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{RUNNERS_LABEL}</h2>
					<p class="content-desc">
						{RUNNERS_DESC}
					</p>
				</div>

				<div class="card settings-card">
					<!-- Built-in runner toggle -->
					<div class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-label">{BUILTIN_RUNNER_TOGGLE_LABEL}</span>
							<span class="toggle-desc">
								{BUILTIN_RUNNER_TOGGLE_DESC}
							</span>
						</div>
						<button
							class="toggle-switch"
							class:on={$builtInEnabled}
							role="switch"
							aria-checked={$builtInEnabled}
							on:click={handleBuiltInToggle}
						>
							<span class="toggle-thumb"></span>
						</button>
					</div>

					<!-- External runner cards -->
					{#if runners.length > 0}
						<div class="runner-cards">
							{#each runners as r (r.id)}
								{@const ping = pingResults[r.id]}
								{#if editingId === r.id}
									<div class="runner-card editing" transition:fly={{ y: -4, duration: 180 }}>
										<div class="runner-form-fields">
											<div class="field">
												<label class="field-label" for="edit-name-{r.id}">{NAME_LABEL}</label>
												<input
													id="edit-name-{r.id}"
													type="text"
													class="field-input"
													bind:value={editForm.name}
													placeholder={RUNNER_NAME_PLACEHOLDER}
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-url-{r.id}">
													{RUNNER_URL_LABEL}
													<span class="field-hint"
														>{RUNNER_URL_HINT_PREFIX} <code>host.docker.internal</code>
														{RUNNER_URL_HINT_SUFFIX}</span
													>
												</label>
												<input
													id="edit-url-{r.id}"
													type="url"
													class="field-input"
													bind:value={editForm.url}
													placeholder={RUNNER_URL_PLACEHOLDER}
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-token-{r.id}">{TOKEN_LABEL}</label>
												<input
													id="edit-token-{r.id}"
													type="text"
													class="field-input"
													bind:value={editForm.token}
													placeholder={KEEP_TOKEN_PLACEHOLDER}
													spellcheck="false"
													autocomplete="off"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-browser-{r.id}">{BROWSER_LABEL}</label>
												<select
													id="edit-browser-{r.id}"
													class="field-input"
													bind:value={editForm.browser}
												>
													{#each BROWSERS as b}
														<option value={b.id}>{b.label}</option>
													{/each}
												</select>
											</div>
										</div>
										{#if editFormError}
											<p class="form-error">{editFormError}</p>
										{/if}
										<div class="runner-form-actions">
											<Button on:click={() => handleUpdateRunner(r.id)} disabled={editFormSaving}>
												{editRunnerSubmitLabel(editFormSaving)}
											</Button>
											<Button
												variant="ghost"
												on:click={() => {
													editingId = null;
													editFormError = '';
												}}
												disabled={editFormSaving}>{CANCEL_LABEL}</Button
											>
										</div>
									</div>
								{:else}
									<div class="runner-card" transition:fly={{ y: -4, duration: 180 }}>
										<div class="runner-card-header">
											<svg
												class="runner-card-icon"
												width="13"
												height="13"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
											>
												<rect x="2" y="3" width="20" height="14" rx="2" />
												<path d="M8 21h8M12 17v4" />
											</svg>
											<span class="runner-card-name">{r.name}</span>
											<span class="runner-browser-pill">{r.browser}</span>
											{#if ping && !ping.loading}
												{#if ping.ok}
													<span class="ping-badge ok">{ping.latency}ms</span>
												{:else}
													<span class="ping-badge fail" title={ping.error}
														>{RUNNER_UNREACHABLE_LABEL}</span
													>
												{/if}
											{:else if ping?.loading}
												<span class="ping-badge pinging">{RUNNER_PINGING_LABEL}</span>
											{/if}
										</div>
										<p class="runner-card-url">{r.url}</p>
										<div class="runner-card-actions">
											<Button variant="ghost" size="sm" on:click={() => startEdit(r)}
												>{EDIT_LABEL}</Button
											>
											<Button
												variant="ghost"
												size="sm"
												disabled={restartingId === r.id}
												on:click={() => handleRestartRunner(r.id, r.name)}
												>{restartRunnerLabel(restartingId === r.id)}</Button
											>
											<Button
												variant="ghost"
												size="sm"
												disabled={stoppingId === r.id}
												on:click={() => handleStopRunner(r.id, r.name)}
												>{stopRunnerLabel(stoppingId === r.id)}</Button
											>
											<Button
												variant="danger"
												size="sm"
												on:click={() => handleDeleteRunner(r.id, r.name)}>{REMOVE_LABEL}</Button
											>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Add runner form / button -->
					{#if runnerFormOpen}
						<div class="runner-form" transition:fly={{ y: -6, duration: 200 }}>
							<p class="runner-form-title">{ADD_RUNNER_FORM_TITLE}</p>
							<div class="runner-form-fields">
								<div class="field">
									<label class="field-label" for="rn-name">{NAME_LABEL}</label>
									<input
										id="rn-name"
										type="text"
										class="field-input"
										bind:value={runnerForm.name}
										placeholder={RUNNER_NAME_PLACEHOLDER}
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-url">
										{RUNNER_URL_LABEL}
										<span class="field-hint"
											>{RUNNER_URL_HINT_PREFIX} <code>host.docker.internal</code>
											{RUNNER_URL_HINT_SUFFIX}</span
										>
									</label>
									<input
										id="rn-url"
										type="url"
										class="field-input"
										bind:value={runnerForm.url}
										placeholder={RUNNER_URL_PLACEHOLDER}
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-token">{TOKEN_LABEL}</label>
									<input
										id="rn-token"
										type="text"
										class="field-input"
										bind:value={runnerForm.token}
										placeholder={TOKEN_PLACEHOLDER}
										spellcheck="false"
										autocomplete="off"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-browser">{BROWSER_LABEL}</label>
									<select id="rn-browser" class="field-input" bind:value={runnerForm.browser}>
										{#each BROWSERS as b}
											<option value={b.id}>{b.label}</option>
										{/each}
									</select>
								</div>
							</div>
							{#if runnerFormError}
								<p class="form-error">{runnerFormError}</p>
							{/if}
							<div class="runner-form-actions">
								<Button on:click={handleAddRunner} disabled={runnerFormSaving}>
									{addRunnerSubmitLabel(runnerFormSaving)}
								</Button>
								<Button
									variant="ghost"
									on:click={() => {
										runnerFormOpen = false;
										runnerFormError = '';
									}}
									disabled={runnerFormSaving}>{CANCEL_LABEL}</Button
								>
							</div>
						</div>
					{:else}
						<div class="card-footer">
							<Button variant="ghost" on:click={() => (runnerFormOpen = true)}
								>{OPEN_ADD_RUNNER_LABEL}</Button
							>
						</div>
					{/if}
				</div>
			</div>

			<!-- REPOSITORY -->
		{:else if section === 'repository'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{REPOSITORY_HEADING}</h2>
					<p class="content-desc">{REPOSITORY_DESC}</p>
				</div>

				<div class="card settings-card">
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="tc-prefix">{CASE_PREFIX_LABEL}</label>
							<input
								id="tc-prefix"
								type="text"
								class="field-input mono"
								bind:value={prefixes.testCasePrefix}
								placeholder={CASE_PREFIX_PLACEHOLDER}
								maxlength="10"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="ts-prefix">{SUITE_PREFIX_LABEL}</label>
							<input
								id="ts-prefix"
								type="text"
								class="field-input mono"
								bind:value={prefixes.testSuitePrefix}
								placeholder={SUITE_PREFIX_PLACEHOLDER}
								maxlength="10"
							/>
						</div>
					</div>
					<p class="content-desc">
						{EXAMPLES_LABEL}
						<code class="code-sample">{prefixes.testCasePrefix || CASE_PREFIX_PLACEHOLDER}-001</code
						>,
						<code class="code-sample"
							>{prefixes.testSuitePrefix || SUITE_PREFIX_PLACEHOLDER}-001</code
						>
					</p>
					<div class="card-footer">
						<Button on:click={handleSavePrefixes} disabled={prefixesSaving}>
							{savePrefixesLabel(prefixesSaving)}
						</Button>
					</div>
				</div>

				<div class="content-header" style="margin-top: 1rem">
					<h2>{MIGRATE_IDS_HEADING}</h2>
					<p class="content-desc">
						{MIGRATE_DESC_PREFIX} <strong>{MIGRATE_DESC_STRONG}</strong>
						{MIGRATE_DESC_SUFFIX}
					</p>
				</div>

				<div class="card settings-card">
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="mig-tc">{NEW_CASE_PREFIX_LABEL}</label>
							<input
								id="mig-tc"
								type="text"
								class="field-input mono"
								bind:value={migrateForm.testCasePrefix}
								placeholder={prefixes.testCasePrefix}
								maxlength="10"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="mig-ts">{NEW_SUITE_PREFIX_LABEL}</label>
							<input
								id="mig-ts"
								type="text"
								class="field-input mono"
								bind:value={migrateForm.testSuitePrefix}
								placeholder={prefixes.testSuitePrefix}
								maxlength="10"
							/>
						</div>
					</div>
					<div class="card-footer">
						<Button variant="ghost" on:click={handleMigratePrefixes} disabled={migrating}>
							{runMigrationLabel(migrating)}
						</Button>
					</div>
				</div>
			</div>

			<!-- INTEGRATIONS -->
		{:else if section === 'integrations'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{INTEGRATIONS_LABEL}</h2>
					<p class="content-desc">
						{INTEGRATIONS_DESC}
					</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">{WEBHOOKS_CARD_TITLE}</p>

					<div class="field">
						<label class="field-label" for="discord-url">
							<span>{DISCORD_WEBHOOK_LABEL}</span>
							<span class="field-hint">{DISCORD_WEBHOOK_HINT}</span>
						</label>
						<input
							id="discord-url"
							type="url"
							class="field-input"
							bind:value={integrations.discordWebhookUrl}
							placeholder={DISCORD_WEBHOOK_PLACEHOLDER}
						/>
					</div>

					<div class="field">
						<label class="field-label" for="slack-url">
							<span>{SLACK_WEBHOOK_LABEL}</span>
							<span class="field-hint">{SLACK_WEBHOOK_HINT}</span>
						</label>
						<input
							id="slack-url"
							type="url"
							class="field-input"
							bind:value={integrations.slackWebhookUrl}
							placeholder={SLACK_WEBHOOK_PLACEHOLDER}
						/>
					</div>

					<div class="field">
						<label class="field-label" for="public-url">
							<span>{PUBLIC_URL_LABEL}</span>
							<span class="field-hint">{PUBLIC_URL_HINT}</span>
						</label>
						<input
							id="public-url"
							type="url"
							class="field-input"
							bind:value={integrations.notifyPublicUrl}
							placeholder={PUBLIC_URL_PLACEHOLDER}
						/>
					</div>

					<Button on:click={handleSaveIntegrations} disabled={integrationsSaving}>
						{saveIntegrationsLabel(integrationsSaving)}
					</Button>
				</div>

				<div class="card settings-card">
					<p class="card-title">{CI_TRIGGERS_CARD_TITLE}</p>
					<p class="content-desc">
						{CI_DESC_PART1} <code class="code-sample">POST {API_BASE}/trigger</code>
						{CI_DESC_PART2}
						<code class="code-sample">Authorization: ApiKey …</code>
						{CI_DESC_PART3}
						<button class="link-btn" on:click={() => setSection('mcp')}>{MCP_TAB_LINK_LABEL}</button
						>
						{CI_DESC_PART4}
						<Badge variant="external">{EXTERNAL_BADGE_LABEL}</Badge>.
					</p>
					<pre class="mcp-snippet">{ciWorkflowSnippet}</pre>
					<div class="card-footer">
						<Button variant="ghost" on:click={handleCopyCiSnippet}>
							{copyCiSnippetLabel(ciSnippetCopied)}
						</Button>
					</div>
				</div>
			</div>

			<!-- MCP -->
		{:else if section === 'mcp'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{MCP_HEADING}</h2>
					<p class="content-desc">
						{MCP_DESC}
					</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">{API_KEY_CARD_TITLE}</p>

					{#if !mcpKeySet}
						<p class="content-desc">{NO_KEY_GENERATED_MESSAGE}</p>
						<div class="card-footer">
							<Button on:click={handleGenerateMcpKey} disabled={mcpGenerating}>
								{generateKeyLabel(mcpGenerating)}
							</Button>
						</div>
					{:else}
						<div class="mcp-key-row">
							<input
								type={mcpShowKey ? 'text' : 'password'}
								class="field-input mcp-key-input"
								value={mcpKey}
								readonly
								spellcheck="false"
								autocomplete="off"
							/>
							<button
								class="icon-btn"
								title={mcpShowKey ? HIDE_KEY_TITLE : SHOW_KEY_TITLE}
								on:click={() => (mcpShowKey = !mcpShowKey)}
							>
								{#if mcpShowKey}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
										/><path
											d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
										/><line x1="1" y1="1" x2="23" y2="23" />
									</svg>
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
											cx="12"
											cy="12"
											r="3"
										/>
									</svg>
								{/if}
							</button>
							<button class="icon-btn" title={COPY_KEY_TITLE} on:click={handleCopyMcpKey}>
								{#if mcpKeyCopied}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" /><path
											d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
										/>
									</svg>
								{/if}
							</button>
						</div>
						<p class="mcp-regen-note">{MCP_REGEN_NOTE}</p>
						<div class="card-footer">
							<Button variant="ghost" on:click={handleGenerateMcpKey} disabled={mcpGenerating}>
								{regenerateKeyLabel(mcpGenerating)}
							</Button>
						</div>
					{/if}
				</div>

				{#if mcpKeySet}
					<div class="card settings-card">
						<p class="card-title">{CONFIG_SNIPPET_CARD_TITLE}</p>
						<p class="content-desc">
							{CONFIG_SNIPPET_DESC_PREFIX}
							<code class="code-sample">claude_desktop_config.json</code
							>{CONFIG_SNIPPET_DESC_SUFFIX}
						</p>
						<pre class="mcp-snippet">{mcpConfigSnippet}</pre>
						<div class="card-footer">
							<Button variant="ghost" on:click={handleCopyMcpSnippet}>
								{copyMcpSnippetLabel(mcpSnippetCopied)}
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<!-- ACCOUNT -->
		{:else if section === 'account'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{ACCOUNT_LABEL}</h2>
					<p class="content-desc">{ACCOUNT_DESC}</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">{PROFILE_CARD_TITLE}</p>
					<div class="field">
						<label class="field-label" for="profile-name">{NAME_LABEL}</label>
						<input
							id="profile-name"
							type="text"
							class="field-input"
							bind:value={profileForm.name}
						/>
					</div>
					<div class="field">
						<label class="field-label" for="profile-email">{EMAIL_LABEL}</label>
						<input
							id="profile-email"
							type="email"
							class="field-input"
							bind:value={profileForm.email}
						/>
					</div>
					{#if profileError}<p class="form-error">{profileError}</p>{/if}
					<div class="card-footer">
						<Button
							on:click={handleUpdateProfile}
							disabled={profileSaving || !profileForm.name || !profileForm.email}
						>
							{saveProfileLabel(profileSaving)}
						</Button>
					</div>
				</div>

				<div class="card settings-card">
					<p class="card-title">{CHANGE_PASSWORD_CARD_TITLE}</p>
					<div class="field">
						<label class="field-label" for="pw-current">{CURRENT_PASSWORD_LABEL}</label>
						<input
							id="pw-current"
							type="password"
							class="field-input"
							bind:value={pwForm.currentPassword}
							autocomplete="current-password"
						/>
					</div>
					<div class="field">
						<label class="field-label" for="pw-new">{NEW_PASSWORD_LABEL}</label>
						<input
							id="pw-new"
							type="password"
							class="field-input"
							bind:value={pwForm.newPassword}
							autocomplete="new-password"
						/>
					</div>
					<div class="field">
						<label class="field-label" for="pw-confirm">{CONFIRM_NEW_PASSWORD_LABEL}</label>
						<input
							id="pw-confirm"
							type="password"
							class="field-input"
							bind:value={pwForm.confirmPassword}
							autocomplete="new-password"
						/>
					</div>
					{#if pwError}<p class="form-error">{pwError}</p>{/if}
					<div class="card-footer">
						<Button
							on:click={handleChangePassword}
							disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword}
						>
							{changePasswordLabel(pwSaving)}
						</Button>
					</div>
				</div>

				<div class="card settings-card">
					<div class="card-footer">
						<Button variant="danger" size="sm" on:click={handleLogout}>{SIGN_OUT_LABEL}</Button>
					</div>
				</div>
			</div>

			<!-- USERS (admin only) -->
		{:else if section === 'users'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{USERS_LABEL}</h2>
					<p class="content-desc">{USERS_DESC}</p>
				</div>

				<ConfirmModal
					bind:open={confirmDeleteUserOpen}
					title={REMOVE_USER_MODAL_TITLE}
					confirmLabel={REMOVE_USER_LABEL}
					on:confirm={() => handleDeleteUser(confirmDeleteUser?.id, confirmDeleteUser?.name)}
				>
					{#if confirmDeleteUser}
						{REMOVE_USER_BODY_PREFIX}
						<strong>{confirmDeleteUser.name}</strong>{REMOVE_USER_BODY_SUFFIX}
					{/if}
				</ConfirmModal>

				<div class="card settings-card">
					<p class="card-title">{ADD_USER_CARD_TITLE}</p>
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="u-name">{NAME_LABEL}</label>
							<input
								id="u-name"
								type="text"
								class="field-input"
								bind:value={userForm.name}
								placeholder={USER_NAME_PLACEHOLDER}
							/>
						</div>
						<div class="field">
							<label class="field-label" for="u-email">{EMAIL_LABEL}</label>
							<input
								id="u-email"
								type="email"
								class="field-input"
								bind:value={userForm.email}
								placeholder={USER_EMAIL_PLACEHOLDER}
							/>
						</div>
					</div>
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="u-pw">{PASSWORD_LABEL}</label>
							<input
								id="u-pw"
								type="password"
								class="field-input"
								bind:value={userForm.password}
								autocomplete="new-password"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="u-role">{ROLE_LABEL}</label>
							<select id="u-role" class="field-input" bind:value={userForm.role}>
								<option value="user">{USER_ROLE_OPTION}</option>
								<option value="admin">{ADMIN_ROLE_OPTION}</option>
							</select>
						</div>
					</div>
					{#if userFormError}<p class="form-error">{userFormError}</p>{/if}
					<div class="card-footer">
						<Button on:click={handleCreateUser} disabled={userFormSaving}>
							{addUserLabel(userFormSaving)}
						</Button>
					</div>
				</div>

				{#if allUsers.length > 0}
					<div class="users-table">
						{#each allUsers as u (u.id)}
							<div class="user-row">
								<div class="user-info">
									<span class="user-name">{u.name}</span>
									<span class="user-email">{u.email}</span>
								</div>
								<span class="role-chip {u.role}">{u.role}</span>
								{#if u.id !== $auth.user?.id}
									<button
										class="icon-btn danger"
										title={REMOVE_USER_ICON_TITLE}
										on:click={() => {
											confirmDeleteUser = { id: u.id, name: u.name };
											confirmDeleteUserOpen = true;
										}}
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="3 6 5 6 21 6" /><path
												d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
											/><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
										</svg>
									</button>
								{:else}
									<span class="you-chip">{YOU_CHIP_LABEL}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- BACKUP -->
		{:else if section === 'backup'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{BACKUP_LABEL}</h2>
					<p class="content-desc">
						{BACKUP_DESC}
					</p>
				</div>

				<!-- Manual export / import -->
				<div class="card settings-card">
					<p class="card-title">{MANUAL_BACKUP_CARD_TITLE}</p>
					<div class="backup-row">
						<div class="backup-block">
							<p class="backup-block-title">{EXPORT_BLOCK_TITLE}</p>
							<p class="backup-block-desc">
								{EXPORT_BLOCK_DESC_PREFIX} <code>.json</code>
								{EXPORT_BLOCK_DESC_SUFFIX}
							</p>
							<Button on:click={handleExport} disabled={exporting}>
								{exportLabel(exporting)}
							</Button>
						</div>

						<div class="backup-divider"></div>

						<div class="backup-block">
							<p class="backup-block-title">{IMPORT_BLOCK_TITLE}</p>
							<p class="backup-block-desc">
								{IMPORT_BLOCK_DESC}
							</p>
							<div class="import-row">
								<label class="file-label">
									<input
										bind:this={fileInput}
										type="file"
										accept=".json"
										class="file-input-hidden"
										on:change={handleFileChange}
									/>
									<span class="file-btn">{importFile ? importFile.name : CHOOSE_FILE_LABEL}</span>
								</label>
								<Button on:click={handleImport} disabled={!importFile || importing}>
									{importLabel(importing)}
								</Button>
							</div>
						</div>
					</div>
					<p class="backup-disclaimer">
						{BACKUP_DISCLAIMER_PREFIX}
						<code>pg_dump</code>
						{BACKUP_DISCLAIMER_SUFFIX}
					</p>
				</div>

				<!-- S3 cloud backup -->
				<div class="card settings-card">
					<p class="card-title">{S3_STORAGE_CARD_TITLE}</p>
					<p class="backup-block-desc" style="margin-bottom: 1.25rem;">
						{S3_STORAGE_DESC_PREFIX} <strong>{ENDPOINT_URL_LABEL}</strong>
						{S3_STORAGE_DESC_SUFFIX}
					</p>

					<div class="field-row">
						<div class="field">
							<label class="field-label" for="s3-endpoint">
								<span>{ENDPOINT_URL_LABEL}</span>
								<span class="field-hint">{ENDPOINT_URL_HINT}</span>
							</label>
							<input
								id="s3-endpoint"
								type="url"
								class="field-input"
								bind:value={backupConfig.backupS3Endpoint}
								placeholder={ENDPOINT_URL_PLACEHOLDER}
							/>
						</div>
						<div class="field">
							<label class="field-label" for="s3-region">
								<span>{REGION_LABEL}</span>
								<span class="field-hint"
									>{REGION_HINT_PREFIX} <code>auto</code> {REGION_HINT_SUFFIX}</span
								>
							</label>
							<input
								id="s3-region"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3Region}
								placeholder={REGION_PLACEHOLDER}
							/>
						</div>
					</div>

					<div class="field-row">
						<div class="field">
							<label class="field-label" for="s3-bucket">
								<span>{BUCKET_LABEL}</span>
							</label>
							<input
								id="s3-bucket"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3Bucket}
								placeholder={BUCKET_PLACEHOLDER}
							/>
						</div>
						<div class="field">
							<label class="field-label" for="s3-prefix">
								<span>{PATH_PREFIX_LABEL}</span>
								<span class="field-hint">{PATH_PREFIX_HINT}</span>
							</label>
							<input
								id="s3-prefix"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3Prefix}
								placeholder={PATH_PREFIX_PLACEHOLDER}
							/>
						</div>
					</div>

					<div class="field-row">
						<div class="field">
							<label class="field-label" for="s3-access-key">
								<span>{ACCESS_KEY_LABEL}</span>
							</label>
							<input
								id="s3-access-key"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3AccessKey}
								placeholder={ACCESS_KEY_PLACEHOLDER}
								autocomplete="off"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="s3-secret-key">
								<span>{SECRET_KEY_LABEL}</span>
								<span class="field-hint">{secretKeyHint(backupS3SecretKeySet)}</span>
							</label>
							<input
								id="s3-secret-key"
								type="password"
								class="field-input"
								bind:value={backupConfig.backupS3SecretKey}
								placeholder={secretKeyPlaceholder(backupS3SecretKeySet)}
								autocomplete="new-password"
							/>
						</div>
					</div>

					<div class="backup-actions">
						<Button variant="ghost" on:click={handleTestS3} disabled={backupTestingS3}>
							{testConnectionLabel(backupTestingS3)}
						</Button>
						<Button on:click={handleSaveBackupConfig} disabled={backupConfigSaving}>
							{saveS3ConfigLabel(backupConfigSaving)}
						</Button>
					</div>

					{#if backupS3TestResult}
						<p
							class="s3-test-result"
							class:s3-test-success={backupS3TestResult === 'success'}
							class:s3-test-error={backupS3TestResult === 'error'}
						>
							{backupS3TestResult === 'success' ? '✓' : '✗'}
							{backupS3TestMessage}
						</p>
					{/if}
				</div>

				<!-- Scheduled backup -->
				<div class="card settings-card" class:card-disabled={!s3Configured}>
					<p class="card-title">{SCHEDULED_BACKUP_CARD_TITLE}</p>

					{#if !s3Configured}
						<p class="backup-block-desc">{CONFIGURE_S3_FIRST_MESSAGE}</p>
					{:else}
						<div class="field">
							<label class="field-label backup-toggle-label" for="backup-enabled">
								<span>{ENABLE_SCHEDULED_BACKUP_LABEL}</span>
								<button
									id="backup-enabled"
									class="toggle-btn"
									class:active={backupConfig.backupEnabled}
									on:click={() => (backupConfig.backupEnabled = !backupConfig.backupEnabled)}
									role="switch"
									aria-checked={backupConfig.backupEnabled}
								>
									<span class="toggle-thumb"></span>
								</button>
							</label>
						</div>

						<div class="field">
							<label class="field-label" for="backup-cron">
								<span>{CRON_EXPRESSION_LABEL}</span>
								<span class="field-hint">
									{CRON_HINT_PREFIX} <code>0 2 * * *</code>
									{CRON_HINT_SUFFIX}
									<a href="https://crontab.guru" target="_blank" rel="noopener noreferrer"
										>{CRONTAB_LINK_LABEL}</a
									>
								</span>
							</label>
							<input
								id="backup-cron"
								type="text"
								class="field-input field-input-mono"
								bind:value={backupConfig.backupCron}
								placeholder={CRON_PLACEHOLDER}
							/>
						</div>

						{#if backupLastRunAt}
							<p class="backup-last-run">
								{BACKUP_LAST_RUN_PREFIX}
								{new Date(backupLastRunAt).toLocaleString()} —
								{#if backupLastStatus?.startsWith('success:')}
									<span class="status-success"
										>{uploadedToLabel(backupLastStatus.replace('success:', ''))}</span
									>
								{:else if backupLastStatus?.startsWith('error:')}
									<span class="status-error">{backupLastStatus.replace('error:', '')}</span>
								{:else}
									<span>{backupLastStatus}</span>
								{/if}
							</p>
						{/if}

						<div class="backup-actions">
							<Button variant="ghost" on:click={handleRunBackupNow} disabled={backupRunningNow}>
								{uploadS3NowLabel(backupRunningNow)}
							</Button>
							<Button on:click={handleSaveBackupConfig} disabled={backupConfigSaving}>
								{saveScheduleLabel(backupConfigSaving)}
							</Button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.page-header h1 {
		font-size: 2.5rem;
	}

	/* ── GitHub-style layout ── */
	.settings-layout {
		display: grid;
		grid-template-columns: 200px 1fr;
		gap: 3rem;
		align-items: start;
	}

	.settings-sidebar {
		position: sticky;
		top: 72px;
	}

	.settings-sidebar nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.sidebar-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.45rem 0.75rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.sidebar-item:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.sidebar-item.active {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 500;
	}

	/* ── Content area ── */
	.settings-content {
		min-width: 0;
	}

	.content-section {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.content-header {
		margin-bottom: 0.25rem;
	}

	.content-header h2 {
		font-size: 1.1rem;
		font-weight: 500;
		font-family: var(--font-body);
		color: var(--text);
		margin-bottom: 0.25rem;
	}

	.content-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	/* ── Card ── */
	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.field-label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.field-hint {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--text-muted);
	}

	.logo-preview {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.preview-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.logo-img {
		max-height: 56px;
		max-width: 200px;
		object-fit: contain;
		border-radius: var(--radius-sm);
	}

	.card-footer {
		padding-top: 0.125rem;
	}

	/* ── Toggle switch ── */
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.875rem 1rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.toggle-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.toggle-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
	}

	.toggle-desc {
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.toggle-switch {
		flex-shrink: 0;
		width: 40px;
		height: 22px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--border);
		cursor: pointer;
		position: relative;
		transition: background 0.2s var(--ease-out);
	}

	.toggle-switch.on {
		background: var(--accent);
	}

	.toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s var(--ease-out);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-switch.on .toggle-thumb {
		transform: translateX(18px);
	}

	/* ── Runner cards ── */
	.runner-cards {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.runner-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		transition: border-color var(--duration-fast);
	}

	.runner-card:hover {
		border-color: color-mix(in srgb, var(--text-muted) 40%, var(--border));
	}

	.runner-card.editing {
		border-color: var(--accent);
		background: var(--accent-soft);
		gap: 0.875rem;
		padding: 1rem;
	}

	.runner-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.runner-card-icon {
		color: var(--node);
		flex-shrink: 0;
	}

	.runner-card-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		flex: 1;
	}

	.runner-browser-pill {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.45rem;
		flex-shrink: 0;
	}

	.runner-card-url {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-left: calc(13px + 0.5rem);
	}

	.runner-card-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding-left: calc(13px + 0.5rem);
		margin-top: 0.125rem;
	}

	.ping-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-pill);
		flex-shrink: 0;
	}

	.ping-badge.ok {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.ping-badge.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.ping-badge.pinging {
		color: var(--text-muted);
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	.runner-form {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		background: var(--bg-subtle);
	}

	.runner-form-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.runner-form-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.runner-form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.card-disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	/* ── Backup ── */
	.backup-row {
		display: flex;
		gap: 2rem;
	}

	.backup-block {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.backup-divider {
		width: 1px;
		background: var(--border);
		flex-shrink: 0;
	}

	.backup-block-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
	}

	.backup-block-desc {
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.backup-block-desc code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		background: var(--bg-subtle);
		padding: 0.1em 0.3em;
		border-radius: 3px;
	}

	.backup-disclaimer {
		margin-top: 1rem;
		padding: 0.625rem 0.875rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.backup-actions {
		display: flex;
		gap: 0.625rem;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}

	.s3-test-result {
		margin-top: 0.625rem;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.s3-test-success {
		color: var(--pass);
	}

	.s3-test-error {
		color: var(--fail);
	}

	.backup-last-run {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
	}

	.status-success {
		color: var(--pass);
	}

	.status-error {
		color: var(--fail);
	}

	.backup-toggle-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: default;
	}

	.toggle-btn {
		flex-shrink: 0;
		width: 40px;
		height: 22px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--border);
		cursor: pointer;
		position: relative;
		transition: background 0.2s var(--ease-out);
	}

	.toggle-btn.active {
		background: var(--accent);
	}

	.toggle-btn .toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s var(--ease-out);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-btn.active .toggle-thumb {
		transform: translateX(18px);
	}

	.field-input-mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
	}

	.import-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.file-label {
		cursor: pointer;
	}

	.file-input-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.file-btn {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.875rem;
		font-size: 0.8125rem;
		font-family: inherit;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		white-space: nowrap;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		transition:
			background var(--duration-fast),
			border-color var(--duration-fast);
	}

	.file-label:hover .file-btn {
		border-color: var(--text-muted);
		background: var(--bg-subtle);
	}

	/* ── Field row (two columns) ── */
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.mono {
		font-family: 'JetBrains Mono', monospace !important;
		font-size: 0.8125rem !important;
	}

	.code-sample {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		background: var(--bg-subtle);
		padding: 0.1em 0.3em;
		border-radius: 3px;
	}

	.link-btn {
		font: inherit;
		color: var(--accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}

	.account-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.account-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
	}

	.account-email {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	/* ── Responsive ── */
	@media (max-width: 640px) {
		.settings-layout {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.settings-sidebar {
			position: static;
		}

		.settings-sidebar nav {
			flex-direction: row;
			flex-wrap: wrap;
		}

		.backup-row {
			flex-direction: column;
		}

		.backup-divider {
			width: 100%;
			height: 1px;
		}

		.runner-form-fields,
		.field-row {
			grid-template-columns: 1fr;
		}
	}

	/* ── Users table ── */
	.users-table {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.user-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
	}

	.user-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.user-name {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text);
	}

	.user-email {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.role-chip {
		font-size: 0.7rem;
		font-weight: 500;
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
		flex-shrink: 0;
	}

	.role-chip.admin {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.role-chip.user {
		background: var(--bg-subtle);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.you-chip {
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
		flex-shrink: 0;
	}

	/* ── MCP ── */
	.mcp-key-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.mcp-key-input {
		flex: 1;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		min-width: 0;
	}

	.mcp-regen-note {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.mcp-snippet {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.875rem 1rem;
		white-space: pre;
		overflow-x: auto;
		color: var(--text);
		line-height: 1.6;
		margin: 0;
	}

	/* reuse icon-btn from other pages */
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
		flex-shrink: 0;
	}

	.icon-btn.danger:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}
</style>
