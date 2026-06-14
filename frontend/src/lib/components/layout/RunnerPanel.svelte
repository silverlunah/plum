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
	import { slide, fly } from 'svelte/transition';
	import { io } from 'socket.io-client';
	import { socket, runnerState, runnerConfig, panelExpanded, triggerRun, testsVersion, reportsVersion, activeCronJobs } from '$lib/stores/runner';
	import { fetchLatestReport, reportUrl } from '$lib/api/reports';
	import Terminal from '$lib/components/ui/Terminal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const WORKER_OPTIONS = [1, 2, 4, 8];

	onMount(() => {
		const s = io('http://localhost:3001');
		socket.set(s);

		s.on('log', (data) => {
			runnerState.update((r) => ({ ...r, output: r.output + data + '\n' }));
		});

		s.on('done', async (code) => {
			const report = await fetchLatestReport().catch(() => null);
			const passed = code === 0;
			runnerState.update((r) => ({
				...r,
				output: r.output + (passed ? '✓ All tests passed\n' : '✗ Some tests failed\n'),
				running: false,
				testCompleted: true,
				latestReport: report,
				status: passed ? 'pass' : 'fail'
			}));
		});

		s.on('tests-changed', () => {
			testsVersion.update((v) => v + 1);
		});

		s.on('report-ready', () => {
			reportsVersion.update((v) => v + 1);
		});

		s.on('cron-start', ({ taskName }) => {
			activeCronJobs.update((j) => ({ ...j, [taskName]: true }));
		});

		s.on('cron-done', ({ taskName }) => {
			activeCronJobs.update((j) => {
				const next = { ...j };
				delete next[taskName];
				return next;
			});
			reportsVersion.update((v) => v + 1);
		});

		return () => s.disconnect();
	});

	$: state = $runnerState;
	$: cfg = $runnerConfig;
	$: dots = Array.from({ length: cfg.workers });
	$: cronJobs = Object.keys($activeCronJobs);
	$: anyCronRunning = cronJobs.length > 0;
	$: anyRunning = state.running || anyCronRunning;

	$: statusColor =
		state.status === 'pass'
			? 'var(--pass)'
			: state.status === 'fail'
				? 'var(--fail)'
				: state.running
					? 'var(--accent)'
					: anyCronRunning
						? 'var(--pass)'
						: 'var(--border)';

	$: statusLabel =
		state.running
			? 'running'
			: state.status === 'pass'
				? 'passed'
				: state.status === 'fail'
					? 'failed'
					: anyCronRunning
						? 'scheduled'
						: 'ready';

	function handleKeydown(e) {
		if (e.key === 'Enter' && !state.running) triggerRun();
	}
</script>

<div class="panel" class:expanded={$panelExpanded}>
	<!-- Header bar — always visible -->
	<div class="bar">
		<div class="bar-left">
			<span class="status-dot" class:pulse={state.running} style="background: {statusColor}"></span>
			<span class="status-label">{statusLabel}</span>
			{#if state.lastRunId}
				<span class="run-id">{state.lastRunId || '(all)'}</span>
			{/if}
		</div>

		<div class="bar-dots" title="{cfg.workers} worker{cfg.workers !== 1 ? 's' : ''}">
			{#each dots as _, i}
				<span
					class="dot"
					class:running={state.running}
					class:pass={state.status === 'pass'}
					class:fail={state.status === 'fail'}
					style="animation-delay: {i * 180}ms"
				></span>
			{/each}
		</div>

		<button
			class="expand-btn"
			on:click={() => panelExpanded.update((v) => !v)}
			aria-label={$panelExpanded ? 'Collapse panel' : 'Expand panel'}
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class:rotated={$panelExpanded}
			>
				<polyline points="18 15 12 9 6 15" />
			</svg>
		</button>
	</div>

	<!-- Body — visible when expanded -->
	{#if $panelExpanded}
		<div class="body" transition:slide={{ duration: 220 }}>
			<div class="controls">
				<input
					type="text"
					class="field-input run-input"
					bind:value={$runnerConfig.testID}
					placeholder="@test-1 or @suite-login or blank for all"
					on:keydown={handleKeydown}
					disabled={state.running}
				/>

				<div class="workers-control">
					{#each WORKER_OPTIONS as n}
						<button
							class="worker-btn"
							class:active={cfg.workers === n}
							on:click={() => runnerConfig.update((c) => ({ ...c, workers: n }))}
						>
							{n}
						</button>
					{/each}
				</div>

				<Button on:click={() => triggerRun()} disabled={state.running}>
					{state.running ? 'Running…' : 'Run'}
				</Button>
			</div>

			<div class="main-row">
				<!-- Terminal column -->
				<div class="terminal-col">
					<Terminal output={state.output} />
					{#if state.testCompleted && state.latestReport}
						<div class="report-row" transition:fly={{ y: 6, duration: 200 }}>
							<a href={reportUrl(state.latestReport)} target="_blank" rel="noopener noreferrer">
								<Button variant="outline" size="sm">View Report →</Button>
							</a>
						</div>
					{/if}
				</div>

				<!-- Sidebar: scheduled jobs -->
				<div class="sidebar">
					<div class="sidebar-section">
						<span class="sidebar-label">Scheduled</span>
						{#if cronJobs.length === 0}
							<span class="sidebar-empty">none running</span>
						{:else}
							<ul class="cron-list">
								{#each cronJobs as name}
									<li class="cron-item" transition:fly={{ x: -6, duration: 180 }}>
										<span class="cron-dot"></span>
										<span class="cron-name">{name}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 200;
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.06);
		transition: box-shadow var(--duration-base) var(--ease-out);
	}

	.panel.expanded {
		box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.1);
	}

	/* ── Header bar ── */
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 1.5rem;
		height: 48px;
		cursor: default;
	}

	.bar-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.status-dot {
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		transition: background var(--duration-base);
	}

	.status-dot.pulse {
		animation: statusPulse 1.6s ease-in-out infinite;
	}

	@keyframes statusPulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.7);
		}
	}

	.status-label {
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.run-id {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Worker dots ── */
	.bar-dots {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--border);
		transition:
			background var(--duration-base),
			transform var(--duration-fast);
	}

	.dot.running {
		background: var(--pass);
		animation: dotBeat 1.4s ease-in-out infinite;
	}

	.dot.pass {
		background: var(--pass);
	}

	.dot.fail {
		background: var(--fail);
	}

	@keyframes dotBeat {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.35;
			transform: scale(0.65);
		}
	}

	.expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.expand-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.expand-btn svg {
		transition: transform var(--duration-base) var(--ease-out);
	}

	.expand-btn svg.rotated {
		transform: rotate(180deg);
	}

	/* ── Body ── */
	.body {
		padding: 0.875rem 1.5rem 1.125rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.run-input {
		flex: 1;
	}

	.workers-control {
		display: flex;
		gap: 2px;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 2px;
		flex-shrink: 0;
	}

	.worker-btn {
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 400;
		min-width: 2rem;
		padding: 0.2rem 0.5rem;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.worker-btn:hover:not(.active) {
		background: var(--bg-elevated);
		color: var(--text);
	}

	.worker-btn.active {
		background: var(--bg-elevated);
		color: var(--accent);
		font-weight: 500;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	/* ── Main row: terminal + sidebar ── */
	.main-row {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.terminal-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		/* Constrain terminal height via the Terminal component's wrapper */
		--terminal-max-height: 140px;
	}

	.report-row {
		display: flex;
	}

	/* ── Sidebar ── */
	.sidebar {
		width: 260px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-left: 1.25rem;
		border-left: 1px solid var(--border);
	}

	.sidebar-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.sidebar-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.sidebar-empty {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.cron-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.cron-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.cron-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--pass);
		flex-shrink: 0;
		animation: statusPulse 1.6s ease-in-out infinite;
	}

	.cron-name {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
