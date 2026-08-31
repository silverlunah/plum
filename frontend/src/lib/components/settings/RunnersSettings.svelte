<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { builtInEnabled } from '$lib/stores/runner';
	import { notify } from '$lib/stores/notifications';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		fetchRunners,
		deleteRunner,
		pingRunner,
		stopRunner,
		restartRunner,
		fetchBuiltInEnabled,
		setBuiltInEnabled
	} from '$lib/api/runners';
	import {
		RUNNERS_LABEL,
		RUNNERS_DESC,
		NETWORK_ERROR,
		REMOVE_RUNNER_FAILED,
		runnerRemovedToast,
		runnerStoppedToast,
		runnerStopFailedToast,
		runnerStopFailedGenericToast,
		runnerRestartingToast,
		runnerRestartFailedToast,
		runnerRestartFailedGenericToast,
		BUILTIN_RUNNER_TOGGLE_LABEL,
		BUILTIN_RUNNER_TOGGLE_DESC,
		BUILTIN_RUNNER_TOGGLE_FAILED,
		RUNNER_UNREACHABLE_LABEL,
		RUNNER_PINGING_LABEL,
		REMOVE_LABEL,
		REGISTER_NODE_NOTE_TITLE,
		REGISTER_NODE_NOTE_PREFIX,
		REGISTER_NODE_NOTE_MIDDLE,
		REGISTER_NODE_NOTE_SUFFIX,
		restartRunnerLabel,
		stopRunnerLabel
	} from '$lib/copy/settings';

	let runners = [];
	let pingResults = {};
	let stoppingId = null;
	let restartingId = null;

	onMount(async () => {
		try {
			const { builtInRunnerEnabled } = await fetchBuiltInEnabled();
			builtInEnabled.set(builtInRunnerEnabled);
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

	let savingBuiltIn = false;
	async function handleBuiltInToggle() {
		if (savingBuiltIn) return;
		const next = !$builtInEnabled;
		savingBuiltIn = true;
		builtInEnabled.set(next);
		try {
			await setBuiltInEnabled(next);
		} catch {
			builtInEnabled.set(!next);
			notify('error', BUILTIN_RUNNER_TOGGLE_FAILED);
		} finally {
			savingBuiltIn = false;
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
			disabled={savingBuiltIn}
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
			{/each}
		</div>
	{/if}

	<div class="register-note">
		<p class="register-note-title">{REGISTER_NODE_NOTE_TITLE}</p>
		<p class="register-note-body">
			{REGISTER_NODE_NOTE_PREFIX}
			<code class="register-note-cmd">plum node start</code>
			{REGISTER_NODE_NOTE_MIDDLE}
			<code class="register-note-cmd">plum manage-nodes</code>
			{REGISTER_NODE_NOTE_SUFFIX}
		</p>
	</div>
</div>

<style>
	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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

	.register-note {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.875rem 1rem;
		background: var(--bg-subtle);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.register-note-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}
	.register-note-body {
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.register-note-cmd {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.9em;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-xs);
		padding: 0.05rem 0.3rem;
	}
</style>
