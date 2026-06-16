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
	import {
		fetchRunners,
		createRunner,
		updateRunner,
		deleteRunner,
		pingRunner,
		probeRunner
	} from '$lib/api/runners';
	import { builtInEnabled } from '$lib/stores/runner';
	import { theme } from '$lib/stores/theme';
	import { BROWSERS, TOAST_TIMEOUT_MS } from '$lib/constants';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';

	/** @type {'project' | 'runners' | 'backup'} */
	let section = 'project';

	let project = { name: '', logoUrl: '' };
	let projectSaving = false;
	let toast = null;

	let importFile = null;
	let importing = false;
	let exporting = false;
	let fileInput;

	let runners = [];
	let runnerForm = { name: '', url: '', token: '', browser: 'chromium' };
	let runnerFormError = '';
	let runnerFormSaving = false;
	let runnerFormOpen = false;
	let pingResults = {};
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
						[r.id]: { ok: false, error: 'Network error', loading: false }
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
			runnerFormError = 'Name, URL and token are required.';
			return;
		}
		runnerFormError = '';
		runnerFormSaving = true;
		try {
			const probe = await probeRunner(runnerForm.url, runnerForm.token);
			if (!probe.ok) {
				runnerFormError = `Cannot reach this runner — ${probe.error ?? 'check the URL and token'}.`;
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
			showToast('success', `Runner "${runner.name}" added.`);
		} catch {
			runnerFormError = 'Failed to add runner.';
		} finally {
			runnerFormSaving = false;
		}
	}

	async function handleDeleteRunner(id, name) {
		try {
			await deleteRunner(id);
			runners = runners.filter((r) => r.id !== id);
			showToast('success', `Runner "${name}" removed.`);
		} catch {
			showToast('error', 'Failed to remove runner.');
		}
	}

	function startEdit(r) {
		editingId = r.id;
		editForm = { name: r.name, url: r.url, token: r.token, browser: r.browser };
		editFormError = '';
	}

	async function handleUpdateRunner(id) {
		if (!editForm.name || !editForm.url || !editForm.token) {
			editFormError = 'Name, URL and token are required.';
			return;
		}
		editFormError = '';
		editFormSaving = true;
		try {
			const probe = await probeRunner(editForm.url, editForm.token);
			if (!probe.ok) {
				editFormError = `Cannot reach this runner — ${probe.error ?? 'check the URL and token'}.`;
				return;
			}
			const { runner } = await updateRunner(id, editForm);
			runners = runners.map((r) => (r.id === id ? runner : r));
			pingResults = { ...pingResults, [id]: { ok: true, latency: probe.latency, loading: false } };
			editingId = null;
			showToast('success', `Runner "${runner.name}" updated.`);
		} catch {
			editFormError = 'Failed to update runner.';
		} finally {
			editFormSaving = false;
		}
	}

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

	const navItems = [
		{ id: 'project', label: 'Project' },
		{ id: 'runners', label: 'Runners' },
		{ id: 'backup', label: 'Backup' }
	];
</script>

<svelte:head><title>Settings — Plum</title></svelte:head>

<Toast {toast} />

<div class="page-header">
	<h1>Settings</h1>
</div>

<div class="settings-layout">
	<!-- Left sidebar -->
	<aside class="settings-sidebar">
		<nav>
			{#each navItems as item}
				<button
					class="sidebar-item"
					class:active={section === item.id}
					on:click={() => (section = item.id)}
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
					<h2>Project</h2>
					<p class="content-desc">Identity information shown across the UI</p>
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

					<!-- Dark mode toggle -->
					<div class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-label">Dark mode</span>
							<span class="toggle-desc">Switch between light and dark appearance</span>
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
							{projectSaving ? 'Saving…' : 'Save Project'}
						</Button>
					</div>
				</div>
			</div>

			<!-- RUNNERS -->
		{:else if section === 'runners'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Runners</h2>
					<p class="content-desc">
						Register self-hosted runner nodes to distribute tests across machines.
					</p>
				</div>

				<div class="card settings-card">
					<!-- Built-in runner toggle -->
					<div class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-label">Built-in runner</span>
							<span class="toggle-desc">
								Use this server to run tests locally. Disable to route all runs to external nodes.
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
												<label class="field-label" for="edit-name-{r.id}">Name</label>
												<input
													id="edit-name-{r.id}"
													type="text"
													class="field-input"
													bind:value={editForm.name}
													placeholder="staging-node"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-url-{r.id}">
													URL
													<span class="field-hint"
														>Use <code>host.docker.internal</code> for local nodes</span
													>
												</label>
												<input
													id="edit-url-{r.id}"
													type="url"
													class="field-input"
													bind:value={editForm.url}
													placeholder="http://host.docker.internal:3002"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-token-{r.id}">Token</label>
												<input
													id="edit-token-{r.id}"
													type="text"
													class="field-input"
													bind:value={editForm.token}
													placeholder="secret-token"
													spellcheck="false"
													autocomplete="off"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-browser-{r.id}">Browser</label>
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
												{editFormSaving ? 'Checking…' : 'Save'}
											</Button>
											<Button
												variant="ghost"
												on:click={() => {
													editingId = null;
													editFormError = '';
												}}
												disabled={editFormSaving}>Cancel</Button
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
													<span class="ping-badge fail" title={ping.error}>unreachable</span>
												{/if}
											{:else if ping?.loading}
												<span class="ping-badge pinging">pinging…</span>
											{/if}
										</div>
										<p class="runner-card-url">{r.url}</p>
										<div class="runner-card-actions">
											<Button variant="ghost" size="sm" on:click={() => startEdit(r)}>Edit</Button>
											<Button
												variant="danger"
												size="sm"
												on:click={() => handleDeleteRunner(r.id, r.name)}>Remove</Button
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
							<p class="runner-form-title">Add runner</p>
							<div class="runner-form-fields">
								<div class="field">
									<label class="field-label" for="rn-name">Name</label>
									<input
										id="rn-name"
										type="text"
										class="field-input"
										bind:value={runnerForm.name}
										placeholder="staging-node"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-url">
										URL
										<span class="field-hint"
											>Use <code>host.docker.internal</code> for local nodes</span
										>
									</label>
									<input
										id="rn-url"
										type="url"
										class="field-input"
										bind:value={runnerForm.url}
										placeholder="http://host.docker.internal:3002"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-token">Token</label>
									<input
										id="rn-token"
										type="text"
										class="field-input"
										bind:value={runnerForm.token}
										placeholder="secret-token"
										spellcheck="false"
										autocomplete="off"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-browser">Browser</label>
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
									{runnerFormSaving ? 'Checking…' : 'Add Runner'}
								</Button>
								<Button
									variant="ghost"
									on:click={() => {
										runnerFormOpen = false;
										runnerFormError = '';
									}}
									disabled={runnerFormSaving}>Cancel</Button
								>
							</div>
						</div>
					{:else}
						<div class="card-footer">
							<Button variant="ghost" on:click={() => (runnerFormOpen = true)}>+ Add Runner</Button>
						</div>
					{/if}
				</div>
			</div>

			<!-- BACKUP -->
		{:else if section === 'backup'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Backup</h2>
					<p class="content-desc">
						Export all scheduled tests, report history, and project settings to a JSON file. Import
						to restore after a data loss or migration.
					</p>
				</div>

				<div class="card settings-card">
					<div class="backup-row">
						<div class="backup-block">
							<p class="backup-block-title">Export</p>
							<p class="backup-block-desc">
								Downloads a <code>.json</code> file containing all cron jobs, report metadata, and project
								settings. Report detail files are stored on disk and not included.
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
		border-radius: 100px;
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
		border-radius: 100px;
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
		gap: 0.375rem;
		padding-left: calc(13px + 0.5rem);
		margin-top: 0.125rem;
	}

	.ping-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.15rem 0.5rem;
		border-radius: 100px;
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

		.runner-form-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
