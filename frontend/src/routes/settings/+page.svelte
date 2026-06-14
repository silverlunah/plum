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
	import { fetchProject, saveProject, exportBackup, importBackup } from '$lib/api/settings';
	import Button from '$lib/components/ui/Button.svelte';

	let project = { name: '', logoUrl: '' };
	let projectSaving = false;
	let toast = null;

	let importFile = null;
	let importing = false;
	let exporting = false;
	let fileInput;

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), 4000);
	}

	onMount(async () => {
		try {
			project = await fetchProject();
		} catch {}
	});

	async function handleSaveProject() {
		projectSaving = true;
		try {
			await saveProject(project);
			showToast('success', 'Project settings saved.');
		} catch {
			showToast('error', 'Failed to save project settings.');
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
			a.download = `plum-backup-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
			showToast('success', 'Backup downloaded.');
		} catch {
			showToast('error', 'Export failed.');
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
			showToast('success', 'Import successful. Cron jobs have been re-scheduled.');
			// Refresh project settings in case they were part of the backup
			project = await fetchProject();
			importFile = null;
			if (fileInput) fileInput.value = '';
		} catch (e) {
			showToast('error', e.message || 'Import failed. Check the file format.');
		} finally {
			importing = false;
		}
	}

	function handleFileChange(e) {
		importFile = e.target.files[0] ?? null;
	}
</script>

<svelte:head><title>Settings — Plum</title></svelte:head>

{#if toast}
	<div class="toast alert alert-{toast.type}" transition:fly={{ y: -8, duration: 240 }}>
		{toast.message}
	</div>
{/if}

<div class="page-header">
	<h1>Settings</h1>
	<p class="subtitle">Configure your project and manage data backups</p>
</div>

<!-- Project section -->
<section class="settings-section">
	<div class="section-header">
		<h2 class="section-title">Project</h2>
		<p class="section-desc">Identity information shown across the UI</p>
	</div>

	<div class="card settings-card">
		<div class="field">
			<label class="field-label" for="project-name">Project Name</label>
			<input
				id="project-name"
				type="text"
				class="field-input"
				bind:value={project.name}
				placeholder="My Test Suite"
			/>
		</div>

		<div class="field">
			<label class="field-label" for="project-logo">
				<span>Logo URL</span>
				<span class="field-hint">Direct link to an image (PNG, SVG, JPG)</span>
			</label>
			<input
				id="project-logo"
				type="url"
				class="field-input"
				bind:value={project.logoUrl}
				placeholder="https://example.com/logo.png"
			/>
		</div>

		{#if project.logoUrl}
			<div class="logo-preview">
				<span class="preview-label">Preview</span>
				<img
					src={project.logoUrl}
					alt="Project logo preview"
					class="logo-img"
					on:error={(e) => (e.target.style.display = 'none')}
				/>
			</div>
		{/if}

		<div class="card-footer">
			<Button on:click={handleSaveProject} disabled={projectSaving}>
				{projectSaving ? 'Saving…' : 'Save Project'}
			</Button>
		</div>
	</div>
</section>

<!-- Backup section -->
<section class="settings-section">
	<div class="section-header">
		<h2 class="section-title">Backup</h2>
		<p class="section-desc">
			Export all scheduled tests, report history, and project settings to a JSON file. Import to
			restore after a data loss or migration.
		</p>
	</div>

	<div class="card settings-card">
		<div class="backup-row">
			<div class="backup-block">
				<p class="backup-block-title">Export</p>
				<p class="backup-block-desc">
					Downloads a <code>.json</code> file containing all cron jobs, report metadata, and project
					settings. Report detail files (the actual test output) are stored on disk and not included.
				</p>
				<Button on:click={handleExport} disabled={exporting}>
					{exporting ? 'Exporting…' : 'Export Backup'}
				</Button>
			</div>

			<div class="backup-divider"></div>

			<div class="backup-block">
				<p class="backup-block-title">Import</p>
				<p class="backup-block-desc">
					Restores cron jobs, report metadata, and project settings from a previously exported
					backup. Existing records with the same identifier are overwritten.
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
						<span class="file-btn">{importFile ? importFile.name : 'Choose file…'}</span>
					</label>
					<Button on:click={handleImport} disabled={!importFile || importing}>
						{importing ? 'Importing…' : 'Import'}
					</Button>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.page-header h1 {
		font-size: 2.5rem;
		margin-bottom: 0.375rem;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.toast {
		margin-bottom: 1.25rem;
		border-radius: var(--radius-md);
	}

	/* Sections */
	.settings-section {
		margin-bottom: 2.5rem;
	}

	.section-header {
		margin-bottom: 1rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Fields */
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
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

	/* Logo preview */
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
		padding-top: 0.25rem;
		border-top: 1px solid var(--border);
	}

	/* Backup layout */
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

	/* File input */
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
	}
</style>
