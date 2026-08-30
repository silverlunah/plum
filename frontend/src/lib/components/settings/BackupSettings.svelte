<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { notify } from '$lib/stores/notifications';
	import { TIMEZONES } from '$lib/utils/timezones';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import {
		exportBackup,
		importBackup,
		fetchBackupConfig,
		saveBackupConfig,
		testBackupS3,
		runBackupNow,
		fetchS3Backups,
		restoreFromS3
	} from '$lib/api/settings';
	import {
		BACKUP_LABEL,
		BACKUP_DESC,
		MANUAL_BACKUP_CARD_TITLE,
		EXPORT_BLOCK_TITLE,
		EXPORT_BLOCK_DESC_PREFIX,
		EXPORT_BLOCK_DESC_SUFFIX,
		IMPORT_BLOCK_TITLE,
		IMPORT_BLOCK_DESC,
		CHOOSE_FILE_LABEL,
		INCLUDE_REPORTS_LABEL,
		INCLUDE_REPORTS_HINT,
		includeReportsDisclaimer,
		saveIncludeReportsLabel,
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
		S3_CONNECTION_SUCCESS,
		S3_CONNECTION_FAILED,
		BACKUP_CONFIG_SAVED_TOAST,
		BACKUP_CONFIG_SAVE_FAILED,
		RESTORE_FROM_S3_CARD_TITLE,
		RESTORE_FROM_S3_DESC,
		CONFIGURE_S3_FIRST_RESTORE_MESSAGE,
		NO_S3_BACKUPS_MESSAGE,
		RESTORE_CONFIRM_TITLE,
		restoreConfirmBody,
		RESTORE_SUCCESS_TOAST,
		RESTORE_FAILED_FALLBACK,
		LIST_S3_BACKUPS_FAILED,
		SCHEDULED_BACKUP_CARD_TITLE,
		CONFIGURE_S3_FIRST_MESSAGE,
		ENABLE_SCHEDULED_BACKUP_LABEL,
		CRON_EXPRESSION_LABEL,
		BACKUP_TIMEZONE_LABEL,
		BACKUP_TIMEZONE_HINT,
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
		saveScheduleLabel,
		restoreLabel,
		refreshingLabel,
		backupSizeLabel
	} from '$lib/copy/settings';

	let backupConfig = {
		backupEnabled: false,
		backupCron: '0 2 * * *',
		timezone: 'UTC',
		backupS3Endpoint: '',
		backupS3Region: '',
		backupS3Bucket: '',
		backupS3AccessKey: '',
		backupS3SecretKey: '',
		backupS3Prefix: '',
		backupIncludeReports: false
	};
	let backupConfigSaving = false;
	let includeReportsSaving = false;
	let backupS3SecretKeySet = false;
	let backupTestingS3 = false;
	let backupRunningNow = false;
	let backupS3TestResult = null;
	let backupS3TestMessage = '';
	let backupLastRunAt = null;
	let backupLastStatus = '';

	let importFile = null;
	let importing = false;
	let exporting = false;
	let fileInput;

	let s3Backups = [];
	let s3BackupsLoaded = false;
	let loadingS3Backups = false;
	let restoringKey = null;
	let restoreConfirmOpen = false;
	let restoreTarget = null;

	onMount(async () => {
		try {
			const bc = await fetchBackupConfig();
			backupS3SecretKeySet = bc.backupS3SecretKeySet;
			backupLastRunAt = bc.backupLastRunAt;
			backupLastStatus = bc.backupLastStatus;
			backupConfig = {
				backupEnabled: bc.backupEnabled,
				backupCron: bc.backupCron,
				timezone: bc.timezone ?? 'UTC',
				backupS3Endpoint: bc.backupS3Endpoint,
				backupS3Region: bc.backupS3Region,
				backupS3Bucket: bc.backupS3Bucket,
				backupS3AccessKey: bc.backupS3AccessKey,
				backupS3SecretKey: '',
				backupS3Prefix: bc.backupS3Prefix,
				backupIncludeReports: bc.backupIncludeReports
			};
		} catch {}
	});

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
			notify('success', BACKUP_DOWNLOADED_TOAST);
		} catch {
			notify('error', EXPORT_FAILED_TOAST);
		} finally {
			exporting = false;
		}
	}

	async function handleImport() {
		if (!importFile) return;
		importing = true;
		try {
			const data = JSON.parse(await importFile.text());
			const result = await importBackup(data);
			if (result.error) throw new Error(result.error);
			notify('success', IMPORT_SUCCESS_TOAST);
			importFile = null;
			if (fileInput) fileInput.value = '';
		} catch (e) {
			notify('error', e.message || IMPORT_FAILED_FALLBACK);
		} finally {
			importing = false;
		}
	}

	function handleFileChange(e) {
		importFile = e.target.files[0] ?? null;
	}

	async function saveConfig(setSaving) {
		setSaving(true);
		try {
			const payload = { ...backupConfig };
			if (!payload.backupS3SecretKey) delete payload.backupS3SecretKey;
			const result = await saveBackupConfig(payload);
			if (result.error) throw new Error(result.error);
			if (backupConfig.backupS3SecretKey) backupS3SecretKeySet = true;
			backupConfig = { ...backupConfig, backupS3SecretKey: '' };
			notify('success', BACKUP_CONFIG_SAVED_TOAST);
		} catch (e) {
			notify('error', e.message || BACKUP_CONFIG_SAVE_FAILED);
		} finally {
			setSaving(false);
		}
	}

	const handleSaveBackupConfig = () => saveConfig((v) => (backupConfigSaving = v));
	const handleSaveIncludeReports = () => saveConfig((v) => (includeReportsSaving = v));

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
			notify('success', BACKUP_UPLOAD_SUCCESS_TOAST);
		} catch (e) {
			notify('error', e.message || BACKUP_UPLOAD_FAILED_FALLBACK);
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

	// Fetch the list once, the first time S3 looks configured — Refresh covers reloads.
	$: if (s3Configured && !s3BackupsLoaded) {
		s3BackupsLoaded = true;
		loadS3Backups();
	}

	async function loadS3Backups() {
		loadingS3Backups = true;
		try {
			const result = await fetchS3Backups();
			if (result.error) throw new Error(result.error);
			s3Backups = result.backups ?? [];
		} catch (e) {
			notify('error', e.message || LIST_S3_BACKUPS_FAILED);
		} finally {
			loadingS3Backups = false;
		}
	}

	function openRestoreConfirm(backup) {
		restoreTarget = backup;
		restoreConfirmOpen = true;
	}

	async function handleRestoreFromS3() {
		if (!restoreTarget) return;
		restoringKey = restoreTarget.key;
		try {
			const result = await restoreFromS3(restoreTarget.key);
			if (result.error) throw new Error(result.error);
			notify('success', RESTORE_SUCCESS_TOAST);
			restoreConfirmOpen = false;
			restoreTarget = null;
		} catch (e) {
			notify('error', e.message || RESTORE_FAILED_FALLBACK);
		} finally {
			restoringKey = null;
		}
	}
</script>

<div class="content-header">
	<h2>{BACKUP_LABEL}</h2>
	<p class="content-desc">{BACKUP_DESC}</p>
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
			<Button on:click={handleExport} disabled={exporting}>{exportLabel(exporting)}</Button>
		</div>

		<div class="backup-divider"></div>

		<div class="backup-block">
			<p class="backup-block-title">{IMPORT_BLOCK_TITLE}</p>
			<p class="backup-block-desc">{IMPORT_BLOCK_DESC}</p>
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

	<div class="include-reports-row">
		<label class="field-label backup-toggle-label" for="include-reports">
			<span>
				{INCLUDE_REPORTS_LABEL}
				<span class="field-hint">{INCLUDE_REPORTS_HINT}</span>
			</span>
			<button
				id="include-reports"
				class="toggle-btn"
				class:active={backupConfig.backupIncludeReports}
				on:click={() => (backupConfig.backupIncludeReports = !backupConfig.backupIncludeReports)}
				role="switch"
				aria-checked={backupConfig.backupIncludeReports}
			>
				<span class="toggle-thumb"></span>
			</button>
		</label>
		<Button variant="ghost" on:click={handleSaveIncludeReports} disabled={includeReportsSaving}>
			{saveIncludeReportsLabel(includeReportsSaving)}
		</Button>
	</div>

	<p class="backup-disclaimer">{includeReportsDisclaimer(backupConfig.backupIncludeReports)}</p>
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
				<span class="field-hint">{REGION_HINT_PREFIX} <code>auto</code> {REGION_HINT_SUFFIX}</span>
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
			<label class="field-label" for="s3-bucket"><span>{BUCKET_LABEL}</span></label>
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
			<label class="field-label" for="s3-access-key"><span>{ACCESS_KEY_LABEL}</span></label>
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

<!-- Restore from S3 -->
<ConfirmModal
	bind:open={restoreConfirmOpen}
	title={RESTORE_CONFIRM_TITLE}
	confirmLabel={restoreLabel(false)}
	loading={!!restoringKey}
	on:confirm={handleRestoreFromS3}
>
	{#if restoreTarget}
		{restoreConfirmBody(restoreTarget.key)}
	{/if}
</ConfirmModal>

<div class="card settings-card" class:card-disabled={!s3Configured}>
	<div class="card-title-row">
		<p class="card-title">{RESTORE_FROM_S3_CARD_TITLE}</p>
		{#if s3Configured}
			<Button variant="ghost" on:click={loadS3Backups} disabled={loadingS3Backups}>
				{refreshingLabel(loadingS3Backups)}
			</Button>
		{/if}
	</div>

	{#if !s3Configured}
		<p class="backup-block-desc">{CONFIGURE_S3_FIRST_RESTORE_MESSAGE}</p>
	{:else}
		<p class="backup-block-desc" style="margin-bottom: 1rem;">{RESTORE_FROM_S3_DESC}</p>

		{#if s3Backups.length === 0}
			<p class="backup-block-desc">
				{loadingS3Backups ? refreshingLabel(true) : NO_S3_BACKUPS_MESSAGE}
			</p>
		{:else}
			<ul class="s3-backup-list">
				{#each s3Backups as backup (backup.key)}
					<li class="s3-backup-row">
						<div class="s3-backup-info">
							<span class="s3-backup-key">{backup.key}</span>
							<span class="s3-backup-meta">
								{new Date(backup.lastModified).toLocaleString()} · {backupSizeLabel(backup.size)}
							</span>
						</div>
						<Button
							variant="ghost"
							on:click={() => openRestoreConfirm(backup)}
							disabled={restoringKey === backup.key}
						>
							{restoreLabel(restoringKey === backup.key)}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
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
					<a href="https://crontab.guru" target="_blank" rel="noopener noreferrer">
						{CRONTAB_LINK_LABEL}
					</a>
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

		<div class="field">
			<label class="field-label" for="backup-timezone">
				<span>{BACKUP_TIMEZONE_LABEL}</span>
				<span class="field-hint">{BACKUP_TIMEZONE_HINT}</span>
			</label>
			<select id="backup-timezone" class="field-input" bind:value={backupConfig.timezone}>
				{#each TIMEZONES as tz}
					<option value={tz}>{tz}</option>
				{/each}
			</select>
		</div>

		{#if backupLastRunAt}
			<p class="backup-last-run">
				{BACKUP_LAST_RUN_PREFIX}
				{new Date(backupLastRunAt).toLocaleString()} —
				{#if backupLastStatus?.startsWith('success:')}
					<span class="status-success">
						{uploadedToLabel(backupLastStatus.replace('success:', ''))}
					</span>
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

<style>
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
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.card-disabled {
		opacity: 0.5;
		pointer-events: none;
	}

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
	.include-reports-row {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
	}
	.include-reports-row .backup-toggle-label {
		flex: 1;
	}
	.include-reports-row .field-label > span {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
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
	.card-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.card-title-row .card-title {
		margin-bottom: 0;
	}
	.s3-backup-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.s3-backup-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.625rem 0.875rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.s3-backup-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.s3-backup-key {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.s3-backup-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
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

	@media (max-width: 640px) {
		.backup-row {
			flex-direction: column;
		}
		.backup-divider {
			width: 100%;
			height: 1px;
		}
		.field-row {
			grid-template-columns: 1fr;
		}
	}
</style>
