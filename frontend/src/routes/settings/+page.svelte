<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		fetchProject,
		saveProject,
		fetchIntegrations,
		saveIntegrations,
		fetchMcpConfig,
		generateMcpKey as generateMcpKeyApi,
		revokeMcpKey as revokeMcpKeyApi
	} from '$lib/api/settings';
	import {
		fetchPrefixes,
		savePrefixes,
		migratePrefixes,
		importTestCases,
		downloadTestCaseExport
	} from '$lib/api/repository';
	import ExportMenu from '$lib/components/ui/ExportMenu.svelte';
	import { updateProfile, changePassword } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
	import { TIMEZONES } from '$lib/utils/timezones';
	import { API_BASE, MAX_TEST_RETRIES, COPY_TIMEOUT_MS, DOCS_URL } from '$lib/constants';
	import { copyText } from '$lib/utils/clipboard';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectAccess from '$lib/components/settings/ProjectAccess.svelte';
	import UpdateBanner from '$lib/components/settings/UpdateBanner.svelte';
	import ActivityLog from '$lib/components/settings/ActivityLog.svelte';
	import RunnersSettings from '$lib/components/settings/RunnersSettings.svelte';
	import UsersSettings from '$lib/components/settings/UsersSettings.svelte';
	import BackupSettings from '$lib/components/settings/BackupSettings.svelte';
	import { notify, notifyProgress } from '$lib/stores/notifications';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { EMAIL_LABEL } from '$lib/copy/common';
	import {
		PAGE_TITLE,
		HEADING,
		NAME_LABEL,
		CURRENT_PROJECT_LABEL,
		PROJECT_LABEL,
		RUNNERS_LABEL,
		REPOSITORY_HEADING,
		TEST_CASES_NAV_LABEL,
		TEST_CASES_HEADING,
		TEST_CASES_DESC,
		TC_IMPORT_CARD_TITLE,
		TC_EXPORT_CARD_TITLE,
		TC_EXPORT_DESC,
		TC_IMPORT_DESC,
		TC_IMPORT_HINT,
		TC_IMPORT_FAILED_FALLBACK,
		TC_IMPORTING_TOAST,
		TC_EXPORTING_TOAST,
		TC_EXPORTED_TOAST,
		tcImportLabel,
		tcImportSummary,
		INTEGRATIONS_LABEL,
		MCP_NAV_LABEL,
		MCP_HEADING,
		ACCOUNT_LABEL,
		USERS_LABEL,
		BACKUP_LABEL,
		ACTIVITY_LABEL,
		ACTIVITY_DESC,
		PROJECT_DESC,
		REPOSITORY_DESC,
		INTEGRATIONS_DESC,
		MCP_DESC,
		ACCOUNT_DESC,
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
		DOCUMENTATION_LABEL,
		PROJECT_SAVED_TOAST,
		PROJECT_SAVE_FAILED,
		saveProjectLabel,
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
		MCP_KEY_REVOKED_TOAST,
		MCP_KEY_REVOKE_FAILED,
		REVOKE_KEY_LABEL,
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
		CHOOSE_FILE_LABEL
	} from '$lib/copy/settings';

	const VALID_SECTIONS = new Set([
		'project',
		'runners',
		'testcases',
		'integrations',
		'mcp',
		'account',
		'users',
		'backup'
	]);

	const querySection = $page.url.searchParams.get('section');
	let section =
		(VALID_SECTIONS.has(querySection) && querySection) ||
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

	let prefixes = { testCasePrefix: 'TC', testSuitePrefix: 'TS' };
	let prefixesSaving = false;
	let migrateForm = { testCasePrefix: '', testSuitePrefix: '' };
	let migrating = false;

	let profileForm = { name: '', email: '' };
	let profileSaving = false;
	let profileError = '';

	let pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
	let pwSaving = false;
	let pwError = '';

	let tcImportFile = null;
	let tcImporting = false;
	let tcFileInput;
	let tcImportResult = null;

	let integrations = { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	let integrationsSaving = false;

	let mcpKey = '';
	let mcpKeySet = false;
	let mcpShowKey = false;
	let mcpGenerating = false;
	let mcpKeyCopied = false;
	let mcpSnippetCopied = false;
	let ciSnippetCopied = false;

	onMount(async () => {
		try {
			project = await fetchProject();
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
		if ($auth.user) {
			profileForm = { name: $auth.user.name, email: $auth.user.email };
		}
	});

	function toggleTheme() {
		theme.update((t) => (t === 'light' ? 'dark' : 'light'));
	}

	async function handleSaveProject() {
		projectSaving = true;
		try {
			await saveProject(project);
			notify('success', PROJECT_SAVED_TOAST);
		} catch {
			notify('error', PROJECT_SAVE_FAILED);
		} finally {
			projectSaving = false;
		}
	}

	function handleTcFileChange(e) {
		tcImportFile = e.target.files[0] ?? null;
		tcImportResult = null;
	}

	async function handleTcImport() {
		if (!tcImportFile) return;
		tcImporting = true;
		tcImportResult = null;
		const settle = notifyProgress(TC_IMPORTING_TOAST);
		try {
			const data = JSON.parse(await tcImportFile.text());
			tcImportResult = await importTestCases(data);
			settle('success', tcImportSummary(tcImportResult));
			tcImportFile = null;
			if (tcFileInput) tcFileInput.value = '';
		} catch (e) {
			settle('error', e.message || TC_IMPORT_FAILED_FALLBACK);
		} finally {
			tcImporting = false;
		}
	}

	let tcExporting = false;
	async function handleTcExport(format) {
		tcExporting = true;
		const settle = notifyProgress(TC_EXPORTING_TOAST);
		try {
			await downloadTestCaseExport('all', null, format);
			settle('success', TC_EXPORTED_TOAST);
		} catch (e) {
			settle('error', e.message || TC_IMPORT_FAILED_FALLBACK);
		} finally {
			tcExporting = false;
		}
	}

	async function handleSavePrefixes() {
		prefixesSaving = true;
		try {
			prefixes = await savePrefixes(prefixes);
			notify('success', PREFIXES_SAVED_TOAST);
		} catch {
			notify('error', PREFIXES_SAVE_FAILED);
		} finally {
			prefixesSaving = false;
		}
	}

	async function handleMigratePrefixes() {
		migrating = true;
		try {
			await migratePrefixes(migrateForm);
			prefixes = { ...prefixes, ...migrateForm };
			notify('success', MIGRATION_COMPLETE_TOAST);
		} catch {
			notify('error', MIGRATION_FAILED_TOAST);
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
			notify('success', PROFILE_UPDATED_TOAST);
		} catch (e) {
			profileError = e.message;
		} finally {
			profileSaving = false;
		}
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
			notify('success', PASSWORD_CHANGED_TOAST);
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
			notify('success', MCP_KEY_GENERATED_TOAST);
		} catch {
			notify('error', MCP_KEY_GENERATE_FAILED);
		} finally {
			mcpGenerating = false;
		}
	}

	async function handleRevokeMcpKey() {
		try {
			await revokeMcpKeyApi();
			mcpKey = '';
			mcpKeySet = false;
			mcpShowKey = false;
			notify('success', MCP_KEY_REVOKED_TOAST);
		} catch {
			notify('error', MCP_KEY_REVOKE_FAILED);
		}
	}

	function handleCopyMcpKey() {
		copyText(mcpKey).then(() => {
			mcpKeyCopied = true;
			setTimeout(() => (mcpKeyCopied = false), COPY_TIMEOUT_MS);
		});
	}

	function handleCopyMcpSnippet() {
		copyText(mcpConfigSnippet).then(() => {
			mcpSnippetCopied = true;
			setTimeout(() => (mcpSnippetCopied = false), COPY_TIMEOUT_MS);
		});
	}

	function handleCopyCiSnippet() {
		copyText(ciWorkflowSnippet).then(() => {
			ciSnippetCopied = true;
			setTimeout(() => (ciSnippetCopied = false), COPY_TIMEOUT_MS);
		});
	}

	async function handleSaveIntegrations() {
		integrationsSaving = true;
		try {
			integrations = await saveIntegrations(integrations);
			notify('success', INTEGRATIONS_SAVED_TOAST);
		} catch {
			notify('error', INTEGRATIONS_SAVE_FAILED);
		} finally {
			integrationsSaving = false;
		}
	}

	$: mcpConfigSnippet = JSON.stringify(
		{
			mcpServers: {
				plum: {
					type: 'http',
					url: `${API_BASE}/mcp`,
					headers: {
						Authorization: `ApiKey ${mcpKey}`
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

	// Per-project settings — the owner and an admin of the active project.
	const ELEVATED_SECTIONS = new Set(['project', 'testcases', 'integrations', 'activity']);
	// Account-wide settings — the owner only.
	const OWNER_SECTIONS = new Set(['runners', 'users', 'backup']);

	$: isOwner = $auth.user?.role === 'owner';
	$: isElevated = $auth.user?.role === 'owner' || $auth.user?.role === 'admin';

	$: {
		if (OWNER_SECTIONS.has(section) && !isOwner) section = 'account';
		else if (ELEVATED_SECTIONS.has(section) && !isElevated) section = 'account';
	}

	$: navItems = [
		...(isElevated
			? [
					{ id: 'project', label: PROJECT_LABEL },
					{ id: 'testcases', label: TEST_CASES_NAV_LABEL },
					{ id: 'integrations', label: INTEGRATIONS_LABEL }
				]
			: []),
		...(isOwner ? [{ id: 'runners', label: RUNNERS_LABEL }] : []),
		...(isElevated ? [{ id: 'activity', label: ACTIVITY_LABEL }] : []),
		{ id: 'account', label: ACCOUNT_LABEL },
		{ id: 'mcp', label: MCP_NAV_LABEL },
		...(isOwner
			? [
					{ id: 'users', label: USERS_LABEL },
					{ id: 'backup', label: BACKUP_LABEL }
				]
			: [])
	];
</script>

<svelte:head><title>{PAGE_TITLE}</title></svelte:head>

<div class="page-header">
	<h1>{HEADING}</h1>
</div>

{#if isOwner}
	<UpdateBanner />
{/if}

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
		<hr class="sidebar-divider" />
		<button
			class="sidebar-item dark-toggle"
			role="switch"
			aria-checked={$theme === 'dark'}
			on:click={toggleTheme}
		>
			<span>{DARK_MODE_LABEL}</span>
			<span class="mini-switch" class:on={$theme === 'dark'}>
				<span class="mini-thumb"></span>
			</span>
		</button>
		<hr class="sidebar-divider" />
		<a class="sidebar-item docs-link" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
			<span>{DOCUMENTATION_LABEL}</span>
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
				<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				<polyline points="15 3 21 3 21 9" />
				<line x1="10" y1="14" x2="21" y2="3" />
			</svg>
		</a>
		<hr class="sidebar-divider" />
		<button class="sidebar-item sign-out" on:click={handleLogout}>{SIGN_OUT_LABEL}</button>
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
					<p class="card-title">{CURRENT_PROJECT_LABEL}</p>
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

					<div class="card-footer">
						<Button on:click={handleSaveProject} disabled={projectSaving || !project.name?.trim()}>
							{saveProjectLabel(projectSaving)}
						</Button>
					</div>
				</div>

				<ProjectAccess on:navigate={(e) => setSection(e.detail)} />
			</div>

			<!-- RUNNERS -->
		{:else if section === 'runners'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<RunnersSettings />
			</div>

			<!-- TEST CASES (repository config + import) -->
		{:else if section === 'testcases'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{TEST_CASES_HEADING}</h2>
					<p class="content-desc">{TEST_CASES_DESC}</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">{TC_EXPORT_CARD_TITLE}</p>
					<div class="backup-block">
						<p class="backup-block-desc">{TC_EXPORT_DESC}</p>
						<ExportMenu busy={tcExporting} on:select={(e) => handleTcExport(e.detail)} />
					</div>
				</div>

				<div class="card settings-card">
					<p class="card-title">{TC_IMPORT_CARD_TITLE}</p>
					<div class="backup-block">
						<p class="backup-block-desc">{TC_IMPORT_DESC}</p>
						<div class="import-row">
							<label class="file-label">
								<input
									bind:this={tcFileInput}
									type="file"
									accept=".json,application/json"
									class="file-input-hidden"
									on:change={handleTcFileChange}
								/>
								<span class="file-btn">{tcImportFile ? tcImportFile.name : CHOOSE_FILE_LABEL}</span>
							</label>
							<Button on:click={handleTcImport} disabled={!tcImportFile || tcImporting}>
								{tcImportLabel(tcImporting)}
							</Button>
						</div>
						{#if tcImportResult}
							<p class="tc-import-result">{tcImportSummary(tcImportResult)}</p>
						{/if}
						<p class="backup-block-desc">{TC_IMPORT_HINT}</p>
					</div>
				</div>

				<div class="content-header" style="margin-top: 1rem">
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
						<Button
							on:click={handleSavePrefixes}
							disabled={prefixesSaving ||
								!prefixes.testCasePrefix.trim() ||
								!prefixes.testSuitePrefix.trim()}
						>
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
							<Button variant="ghost" on:click={handleRevokeMcpKey}>{REVOKE_KEY_LABEL}</Button>
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
							disabled={pwSaving ||
								!pwForm.currentPassword ||
								!pwForm.newPassword ||
								!pwForm.confirmPassword}
						>
							{changePasswordLabel(pwSaving)}
						</Button>
					</div>
				</div>
			</div>

			<!-- USERS (owner only) -->
		{:else if section === 'users'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<UsersSettings on:navigate={(e) => setSection(e.detail)} />
			</div>

			<!-- BACKUP -->
		{:else if section === 'backup'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<BackupSettings />
			</div>

			<!-- ACTIVITY -->
		{:else if section === 'activity'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>{ACTIVITY_LABEL}</h2>
					<p class="content-desc">{ACTIVITY_DESC}</p>
				</div>
				<ActivityLog canSeeOrg={isOwner} />
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

	.sidebar-divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.5rem 0.25rem;
	}

	.dark-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.docs-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		text-decoration: none;
	}
	.docs-link svg {
		flex-shrink: 0;
		opacity: 0.6;
	}

	.sidebar-item.sign-out {
		color: var(--fail);
	}

	.sidebar-item.sign-out:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.mini-switch {
		position: relative;
		flex-shrink: 0;
		width: 32px;
		height: 18px;
		border-radius: var(--radius-pill);
		background: var(--border);
		transition: background var(--duration-fast);
	}
	.mini-switch.on {
		background: var(--accent);
	}
	.mini-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--white);
		transition: transform var(--duration-fast);
	}
	.mini-switch.on .mini-thumb {
		transform: translateX(14px);
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
		padding-top: 0.5rem;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	.backup-block {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.backup-block-desc {
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.tc-import-result {
		margin-top: 0.75rem;
		font-size: 0.85rem;
		color: var(--text);
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

		.field-row {
			grid-template-columns: 1fr;
		}
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
</style>
