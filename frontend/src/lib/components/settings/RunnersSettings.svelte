<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { builtInEnabled } from '$lib/stores/runner';
	import { notify } from '$lib/stores/notifications';
	import { BROWSERS } from '$lib/constants';
	import Button from '$lib/components/ui/Button.svelte';
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
	import { CANCEL_LABEL, EDIT_LABEL } from '$lib/copy/common';
	import {
		NAME_LABEL,
		RUNNERS_LABEL,
		RUNNERS_DESC,
		NETWORK_ERROR,
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
		stopRunnerLabel
	} from '$lib/copy/settings';

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

	onMount(async () => {
		try {
			const bi = localStorage.getItem('plum:builtInEnabled');
			if (bi !== null) builtInEnabled.set(bi !== 'false');
		} catch {}
		try {
			runners = await fetchRunners();
			pingAll();
		} catch {}
	});

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

	async function refreshPing(id) {
		pingResults = { ...pingResults, [id]: { loading: true } };
		try {
			const result = await pingRunner(id);
			pingResults = { ...pingResults, [id]: { ...result, loading: false } };
		} catch {
			pingResults = { ...pingResults, [id]: { ok: false, error: NETWORK_ERROR, loading: false } };
		}
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
			notify('success', runnerAddedToast(runner.name));
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
			notify('success', runnerRemovedToast(name));
		} catch {
			notify('error', REMOVE_RUNNER_FAILED);
		}
	}

	async function handleStopRunner(id, name) {
		stoppingId = id;
		try {
			const result = await stopRunner(id);
			if (result.ok) notify('success', runnerStoppedToast(name));
			else notify('error', runnerStopFailedToast(name, result.error));
		} catch {
			notify('error', runnerStopFailedGenericToast(name));
		} finally {
			stoppingId = null;
			refreshPing(id);
		}
	}

	async function handleRestartRunner(id, name) {
		restartingId = id;
		try {
			const result = await restartRunner(id);
			if (result.ok) notify('success', runnerRestartingToast(name));
			else notify('error', runnerRestartFailedToast(name, result.error));
		} catch {
			notify('error', runnerRestartFailedGenericToast(name));
		} finally {
			restartingId = null;
			// Give the replacement process a moment to bind before checking on it.
			setTimeout(() => refreshPing(id), 2000);
		}
	}

	function startEdit(r) {
		editingId = r.id;
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
			// Only re-probe when the admin typed a new token — blank means "keep the
			// existing one", which the still-running node already accepts.
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
			notify('success', runnerUpdatedToast(runner.name));
		} catch {
			editFormError = UPDATE_RUNNER_FAILED;
		} finally {
			editFormSaving = false;
		}
	}
</script>

<div class="content-header">
	<h2>{RUNNERS_LABEL}</h2>
	<p class="content-desc">{RUNNERS_DESC}</p>
</div>

<div class="card settings-card">
	<!-- Built-in runner toggle -->
	<div class="toggle-row">
		<div class="toggle-info">
			<span class="toggle-label">{BUILTIN_RUNNER_TOGGLE_LABEL}</span>
			<span class="toggle-desc">{BUILTIN_RUNNER_TOGGLE_DESC}</span>
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
									<span class="field-hint">
										{RUNNER_URL_HINT_PREFIX} <code>host.docker.internal</code>
										{RUNNER_URL_HINT_SUFFIX}
									</span>
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
								<select id="edit-browser-{r.id}" class="field-input" bind:value={editForm.browser}>
									{#each BROWSERS as b}
										<option value={b.id}>{b.label}</option>
									{/each}
								</select>
							</div>
						</div>
						{#if editFormError}<p class="form-error">{editFormError}</p>{/if}
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
								disabled={editFormSaving}
							>
								{CANCEL_LABEL}
							</Button>
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
									<span class="ping-badge fail" title={ping.error}>{RUNNER_UNREACHABLE_LABEL}</span>
								{/if}
							{:else if ping?.loading}
								<span class="ping-badge pinging">{RUNNER_PINGING_LABEL}</span>
							{/if}
						</div>
						<p class="runner-card-url">{r.url}</p>
						<div class="runner-card-actions">
							<Button variant="ghost" size="sm" on:click={() => startEdit(r)}>{EDIT_LABEL}</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={restartingId === r.id}
								on:click={() => handleRestartRunner(r.id, r.name)}
							>
								{restartRunnerLabel(restartingId === r.id)}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={stoppingId === r.id}
								on:click={() => handleStopRunner(r.id, r.name)}
							>
								{stopRunnerLabel(stoppingId === r.id)}
							</Button>
							<Button variant="danger" size="sm" on:click={() => handleDeleteRunner(r.id, r.name)}>
								{REMOVE_LABEL}
							</Button>
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
						<span class="field-hint">
							{RUNNER_URL_HINT_PREFIX} <code>host.docker.internal</code>
							{RUNNER_URL_HINT_SUFFIX}
						</span>
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
			{#if runnerFormError}<p class="form-error">{runnerFormError}</p>{/if}
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
					disabled={runnerFormSaving}
				>
					{CANCEL_LABEL}
				</Button>
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
	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

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

	@media (max-width: 640px) {
		.runner-form-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
