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
	import { onMount, afterUpdate, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { fly, fade } from 'svelte/transition';
	import { runnerState, cancelRun } from '$lib/stores/runner';
	import { reportUrl } from '$lib/api/reports';

	let terminalEl;
	let laneEls = {};
	let redirectTimer = null;
	let redirectCountdown = 3;
	let countdownInterval = null;

	$: state = $runnerState;
	$: isMulti = state.lanes.length > 1;

	// Auto-scroll terminals
	afterUpdate(() => {
		if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
		for (const el of Object.values(laneEls)) {
			if (el) el.scrollTop = el.scrollHeight;
		}
	});

	// Watch for test completion → auto-navigate to report
	$: if (state.testCompleted && state.latestReportId && !redirectTimer) {
		redirectCountdown = 3;
		countdownInterval = setInterval(() => {
			redirectCountdown--;
			if (redirectCountdown <= 0) {
				clearInterval(countdownInterval);
			}
		}, 1000);
		redirectTimer = setTimeout(() => {
			goto(reportUrl(state.latestReportId));
		}, 3000);
	}

	onDestroy(() => {
		if (redirectTimer) clearTimeout(redirectTimer);
		if (countdownInterval) clearInterval(countdownInterval);
	});

	function goNow() {
		if (redirectTimer) clearTimeout(redirectTimer);
		if (countdownInterval) clearInterval(countdownInterval);
		goto(reportUrl(state.latestReportId));
	}

	function handleCancel() {
		cancelRun();
	}

	function laneStatusColor(status) {
		if (status === 'done') return 'var(--pass)';
		if (status === 'error') return 'var(--fail)';
		return 'var(--accent)';
	}
</script>

<svelte:head><title>Live Run — Plum</title></svelte:head>

<div class="back-row">
	<a href="/reports" class="back-link">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="12 19 5 12 12 5" />
		</svg>
		Reports
	</a>
</div>

{#if !state.running && !state.testCompleted}
	<!-- Nothing running and no completed test -->
	<div class="idle-state">
		<div class="idle-icon">
			<svg
				width="40"
				height="40"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="10" />
				<polyline points="12 6 12 12 16 14" />
			</svg>
		</div>
		<h2>No tests currently running</h2>
		<p>Start a test from the panel below, then come back here to watch it live.</p>
		<a href="/reports" class="idle-link">View past reports →</a>
	</div>
{:else}
	<!-- Run header -->
	<div
		class="run-header"
		class:header-pass={state.status === 'pass'}
		class:header-fail={state.status === 'fail'}
	>
		<div class="header-left">
			{#if state.running}
				<span class="live-badge">
					<span class="live-dot"></span>
					Live
				</span>
			{:else if state.status === 'pass'}
				<span class="result-badge pass-badge">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
					Passed
				</span>
			{:else}
				<span class="result-badge fail-badge">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
					Failed
				</span>
			{/if}

			{#if state.currentRun}
				<div class="run-info">
					<span class="run-tag-label">{state.currentRun.tag || 'all tests'}</span>
					<span class="run-sep">·</span>
					<span class="run-detail"
						>{state.currentRun.workers} worker{state.currentRun.workers !== 1 ? 's' : ''}</span
					>
					<span class="run-sep">·</span>
					<span class="run-detail">{state.currentRun.browser}</span>
					{#if isMulti}
						<span class="run-sep">·</span>
						<span class="run-detail">{state.lanes.length} runners</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if state.running}
			<button class="cancel-btn" on:click={handleCancel}>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<line x1="9" y1="9" x2="15" y2="15" />
					<line x1="15" y1="9" x2="9" y2="15" />
				</svg>
				Cancel run
			</button>
		{/if}
	</div>

	<!-- Completion overlay -->
	{#if state.testCompleted && state.latestReportId}
		<div
			class="completion-bar"
			class:pass-bar={state.status === 'pass'}
			class:fail-bar={state.status === 'fail'}
			transition:fly={{ y: -8, duration: 250 }}
		>
			<div class="completion-left">
				{#if state.status === 'pass'}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
					All tests passed
				{:else}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
					Some tests failed
				{/if}
			</div>
			<div class="completion-right">
				<span class="redirect-hint">Redirecting in {redirectCountdown}s…</span>
				<button class="view-now-btn" on:click={goNow}>
					View Report Now
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
					</svg>
				</button>
			</div>
		</div>
	{/if}

	<!-- Terminals -->
	{#if isMulti}
		<!-- Multi-runner: one terminal per lane -->
		<div
			class="lanes-grid"
			style="grid-template-columns: repeat({Math.min(state.lanes.length, 2)}, 1fr)"
		>
			{#each state.lanes as lane}
				<div class="lane-terminal">
					<div class="lane-header">
						<span
							class="lane-dot"
							style="background:{laneStatusColor(lane.status)}; {lane.status === 'running'
								? 'animation: dotPulse 1.6s ease-in-out infinite'
								: ''}"
						></span>
						<span class="lane-name">{lane.name}</span>
						{#if lane.testCount}
							<span class="lane-count">{lane.testCount} test{lane.testCount !== 1 ? 's' : ''}</span>
						{/if}
						<span class="lane-status-text" style="color:{laneStatusColor(lane.status)}">
							{lane.status === 'done' ? 'Done' : lane.status === 'error' ? 'Failed' : 'Running'}
						</span>
					</div>
					<div class="terminal-bar">
						<span class="dot red"></span>
						<span class="dot yellow"></span>
						<span class="dot green"></span>
					</div>
					<pre class="terminal" bind:this={laneEls[lane.id]}>{lane.logs ||
							'(waiting for output…)'}</pre>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Single terminal -->
		<div class="terminal-wrap">
			<div class="terminal-bar">
				<span class="dot red"></span>
				<span class="dot yellow"></span>
				<span class="dot green"></span>
				<span class="terminal-label">
					{state.running ? 'Running…' : 'Finished'}
				</span>
			</div>
			<pre class="terminal" bind:this={terminalEl}>{state.output}</pre>
		</div>
	{/if}
{/if}

<style>
	.back-row {
		margin-bottom: 1.5rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
		transition: color var(--duration-fast);
	}

	.back-link:hover {
		color: var(--text);
	}

	/* ── Idle state ── */
	.idle-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 5rem 1rem;
		text-align: center;
		gap: 0.75rem;
	}

	.idle-icon {
		color: var(--text-muted);
		opacity: 0.4;
		margin-bottom: 0.5rem;
	}

	.idle-state h2 {
		font-size: 1.5rem;
		font-weight: 400;
	}

	.idle-state p {
		font-size: 0.9375rem;
		color: var(--text-muted);
		max-width: 360px;
	}

	.idle-link {
		font-size: 0.875rem;
		color: var(--accent);
		text-decoration: none;
		margin-top: 0.5rem;
	}

	.idle-link:hover {
		text-decoration: underline;
	}

	/* ── Run header ── */
	.run-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		margin-bottom: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-bottom: none;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		animation: fadeUp 0.3s var(--ease-out) both;
	}

	.run-header.header-pass {
		border-top: 3px solid var(--pass);
	}
	.run-header.header-fail {
		border-top: 3px solid var(--fail);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		flex-wrap: wrap;
	}

	/* Live badge */
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fff;
		background: var(--accent);
		padding: 0.2rem 0.6rem;
		border-radius: 100px;
	}

	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.8);
		animation: dotPulse 1.2s ease-in-out infinite;
	}

	@keyframes dotPulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(0.65);
		}
	}

	/* Result badges */
	.result-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.2rem 0.6rem;
		border-radius: 100px;
	}

	.pass-badge {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.fail-badge {
		background: var(--fail-soft);
		color: var(--fail);
	}

	.run-info {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.run-tag-label {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.run-sep {
		color: var(--text-muted);
		opacity: 0.4;
		font-size: 0.75rem;
	}

	.run-detail {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
	}

	/* Cancel button */
	.cancel-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--fail);
		background: var(--fail-soft);
		border: 1px solid var(--fail);
		border-radius: var(--radius-sm);
		padding: 0.35rem 0.75rem;
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
		flex-shrink: 0;
	}

	.cancel-btn:hover {
		background: var(--fail);
		color: #fff;
	}

	/* ── Completion bar ── */
	.completion-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		gap: 1rem;
		border: 1px solid var(--border);
		border-top: none;
		border-bottom: none;
		animation: fadeUp 0.3s var(--ease-out) both;
	}

	.completion-bar.pass-bar {
		background: var(--pass-soft);
		border-color: color-mix(in srgb, var(--pass) 30%, var(--border));
		color: var(--pass);
	}

	.completion-bar.fail-bar {
		background: var(--fail-soft);
		border-color: color-mix(in srgb, var(--fail) 30%, var(--border));
		color: var(--fail);
	}

	.completion-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.completion-right {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.redirect-hint {
		font-size: 0.8rem;
		opacity: 0.7;
		font-family: 'JetBrains Mono', monospace;
		color: inherit;
	}

	.view-now-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 600;
		color: inherit;
		background: transparent;
		border: 1.5px solid currentColor;
		border-radius: var(--radius-sm);
		padding: 0.3rem 0.75rem;
		cursor: pointer;
		transition: background var(--duration-fast);
	}

	.view-now-btn:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	/* ── Terminal ── */
	.terminal-wrap {
		border: 1px solid var(--border);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) 0.05s both;
	}

	.run-header + .terminal-wrap,
	.run-header + .completion-bar + .terminal-wrap {
		border-top: none;
	}

	.terminal-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.6rem 0.875rem;
		background: rgba(0, 0, 0, 0.35);
	}

	.dot {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.dot.red {
		background: #ff5f57;
	}
	.dot.yellow {
		background: #febc2e;
	}
	.dot.green {
		background: #28c840;
	}

	.terminal-label {
		margin-left: auto;
		font-size: 0.68rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.3);
	}

	.terminal {
		font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
		font-size: 0.8rem;
		line-height: 1.75;
		background: var(--terminal-bg);
		color: var(--terminal-text);
		padding: 1rem 1.25rem;
		height: calc(100vh - 320px);
		min-height: 240px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.terminal::-webkit-scrollbar {
		width: 4px;
	}
	.terminal::-webkit-scrollbar-track {
		background: transparent;
	}
	.terminal::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}

	/* ── Multi-runner lanes ── */
	.lanes-grid {
		display: grid;
		gap: 1rem;
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.lane-terminal {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.lane-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		background: var(--bg-subtle);
		border-bottom: 1px solid var(--border);
	}

	.lane-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.lane-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.lane-count {
		font-size: 0.72rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
	}

	.lane-status-text {
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.lane-terminal .terminal {
		height: 280px;
		min-height: unset;
		font-size: 0.75rem;
	}
</style>
