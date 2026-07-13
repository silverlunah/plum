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
	import { afterUpdate, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { fly, fade } from 'svelte/transition';
	import { runnerState, cancelRun, backgroundRuns } from '$lib/stores/runner';
	import { reportUrl } from '$lib/api/reports';
	import { REDIRECT_DELAY_MS, ALL_TESTS_LABEL } from '$lib/constants';
	import { triggerLabel } from '$lib/utils/format';
	import BackLink from '$lib/components/ui/BackLink.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	const EMPTY_BG_STATE = {
		output: '',
		running: false,
		testCompleted: false,
		latestReportId: null,
		status: 'idle',
		lanes: [],
		currentRun: null,
		latestScreenshot: null
	};

	let terminalEl;
	let laneTerminalEl;
	let redirectTimer = null;
	let redirectCountdown = REDIRECT_DELAY_MS / 1000;
	let countdownInterval = null;
	let activeTab = null;

	$: bgRunId = $page.url.searchParams.get('run');
	$: state = bgRunId ? ($backgroundRuns[bgRunId] ?? EMPTY_BG_STATE) : $runnerState;
	$: isMulti = state.lanes.length > 0;
	$: runningBgList = Object.entries($backgroundRuns).filter(([, r]) => r.running);
	$: showPicker = !bgRunId && !state.running && !state.testCompleted && runningBgList.length > 0;
	$: showIdle = !state.running && !state.testCompleted && !showPicker;

	$: if (showPicker && runningBgList.length === 1) {
		goto(`/reports/live?run=${runningBgList[0][0]}`);
	}

	// Keep active tab pointing at a valid lane
	$: {
		if (state.lanes.length === 0) {
			activeTab = null;
		} else if (!state.lanes.find((l) => l.id === activeTab)) {
			activeTab = state.lanes[0].id;
		}
	}
	$: activeLane = state.lanes.find((l) => l.id === activeTab) ?? null;

	afterUpdate(() => {
		if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
		if (laneTerminalEl) laneTerminalEl.scrollTop = laneTerminalEl.scrollHeight;
	});

	$: if (state.testCompleted && state.latestReportId && !redirectTimer) {
		redirectCountdown = REDIRECT_DELAY_MS / 1000;
		countdownInterval = setInterval(() => {
			redirectCountdown--;
			if (redirectCountdown <= 0) clearInterval(countdownInterval);
		}, 1000);
		redirectTimer = setTimeout(() => goto(reportUrl(state.latestReportId)), REDIRECT_DELAY_MS);
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
</script>

<svelte:head><title>Live Run — Plum</title></svelte:head>

<BackLink href="/reports" label="Reports" />

{#if showIdle}
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
{:else if showPicker}
	<div class="cron-running-state">
		<div class="cron-running-icon"><span class="cron-pulse-dot"></span></div>
		<h2>{runningBgList.length === 1 ? 'A run' : `${runningBgList.length} runs`} in progress</h2>
		<div class="cron-task-list">
			{#each runningBgList as [runId, run] (runId)}
				<a href="/reports/live?run={runId}" class="cron-task-chip"
					>{run.label} · {triggerLabel(run.kind)}</a
				>
			{/each}
		</div>
		<p>Select a run above, or wait — the report opens automatically when it finishes.</p>
	</div>
{:else}
	<!-- ── Run header ── -->
	<div
		class="run-header"
		class:header-pass={state.status === 'pass'}
		class:header-fail={state.status === 'fail'}
	>
		<div class="header-left">
			{#if state.running}
				<span class="live-badge"><span class="live-dot"></span>Live</span>
			{:else if state.status === 'pass'}
				<Badge variant="pass">Passed</Badge>
			{:else}
				<Badge variant="fail">Failed</Badge>
			{/if}

			{#if state.currentRun}
				<div class="run-info">
					{#if state.currentRun.runTitle}
						<span class="run-title-label">{state.currentRun.runTitle}</span>
						<span class="run-sep">·</span>
					{/if}
					<span class="run-tag-label">{state.currentRun.tag || ALL_TESTS_LABEL}</span>
					<span class="run-sep">·</span>
					<span class="run-detail"
						>{state.currentRun.workers} worker{state.currentRun.workers !== 1 ? 's' : ''}</span
					>
					<span class="run-sep">·</span>
					<span class="run-detail">{state.currentRun.browser}</span>
					{#if state.lanes.length > 1}
						<span class="run-sep">·</span>
						<span class="run-detail">{state.lanes.length} runners</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if state.running && !bgRunId}
			<button class="cancel-btn" on:click={cancelRun}>
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

	<!-- ── Completion bar ── -->
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
						stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
					>
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
						><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
					>
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
						><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg
					>
				</button>
			</div>
		</div>
	{/if}

	<!-- ── Multi-runner tabs ── -->
	{#if isMulti}
		<div class="lane-tabs">
			{#each state.lanes as lane}
				<button
					class="lane-tab"
					class:active={activeTab === lane.id}
					on:click={() => (activeTab = lane.id)}
				>
					<span
						class="tab-dot"
						class:tab-dot-running={lane.status === 'running'}
						class:tab-dot-done={lane.status === 'done'}
						class:tab-dot-error={lane.status === 'error'}
					></span>
					{lane.name}
					{#if lane.testCount}
						<span class="tab-count">{lane.testCount}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- ── Dual-stream view ── -->
	<div class="run-view" class:no-top-radius={isMulti}>
		<!-- Screenshot panel -->
		<div class="screenshot-panel">
			{#if isMulti}
				{#if activeLane?.latestScreenshot}
					{#key activeLane.latestScreenshot.data}
						<img
							src="data:image/jpeg;base64,{activeLane.latestScreenshot.data}"
							class="live-shot"
							alt="Live browser view"
							in:fade={{ duration: 120 }}
						/>
					{/key}
					<div class="step-overlay">
						<span class="step-keyword">Step</span>
						<span class="step-name">{activeLane.latestScreenshot.stepName}</span>
					</div>
				{:else}
					<div class="awaiting-state">
						<svg
							width="32"
							height="32"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.2"
							stroke-linecap="round"
							stroke-linejoin="round"
							opacity="0.25"
						>
							<rect x="2" y="5" width="20" height="14" rx="2" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						<span>{activeLane?.status === 'running' ? 'Awaiting stream...' : 'No stream...'}</span>
					</div>
				{/if}
			{:else if state.latestScreenshot}
				{#key state.latestScreenshot.data}
					<img
						src="data:image/jpeg;base64,{state.latestScreenshot.data}"
						class="live-shot"
						alt="Live browser view"
						in:fade={{ duration: 120 }}
					/>
				{/key}
				<div class="step-overlay">
					<span class="step-keyword">Step</span>
					<span class="step-name">{state.latestScreenshot.stepName}</span>
				</div>
			{:else}
				<div class="awaiting-state">
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						opacity="0.25"
					>
						<rect x="2" y="5" width="20" height="14" rx="2" />
						<circle cx="12" cy="12" r="3" />
					</svg>
					<span>{state.running ? 'Awaiting stream...' : 'No stream'}</span>
				</div>
			{/if}
		</div>

		<!-- Terminal panel -->
		<div class="terminal-panel">
			<div class="terminal-bar">
				<span class="dot red"></span>
				<span class="dot yellow"></span>
				<span class="dot green"></span>
				<span class="terminal-label">
					{#if isMulti}
						{activeLane?.name ?? 'Runner'}
					{:else}
						{state.running ? 'Running…' : 'Finished'}
					{/if}
				</span>
			</div>
			{#if isMulti}
				<pre class="terminal" bind:this={laneTerminalEl}>{activeLane?.logs ||
						'(waiting for output…)'}</pre>
			{:else}
				<pre class="terminal" bind:this={terminalEl}>{state.output}</pre>
			{/if}
		</div>
	</div>
{/if}

<style>
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

	/* ── Cron running state ── */
	.cron-running-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 5rem 1rem;
		text-align: center;
		gap: 0.75rem;
	}
	.cron-running-icon {
		margin-bottom: 0.5rem;
	}
	.cron-pulse-dot {
		display: inline-block;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--pass);
		animation: pulse-pass 1.4s ease-in-out infinite;
	}
	@keyframes pulse-pass {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.8);
		}
	}
	.cron-running-state h2 {
		font-size: 1.5rem;
		font-weight: 400;
	}
	.cron-task-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}
	.cron-task-chip {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: var(--radius-pill);
		padding: 0.2rem 0.65rem;
		text-decoration: none;
		cursor: pointer;
		transition: background var(--duration-fast);
	}
	.cron-task-chip:hover {
		background: color-mix(in srgb, var(--accent) 15%, var(--accent-soft));
	}
	.cron-running-state p {
		font-size: 0.9375rem;
		color: var(--text-muted);
		max-width: 360px;
	}

	/* ── Run header ── */
	.run-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1.25rem;
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

	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--white);
		background: var(--accent);
		padding: 0.2rem 0.6rem;
		border-radius: var(--radius-pill);
	}
	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.8);
		animation: dotPulse 1.2s ease-in-out infinite;
	}

	.run-info {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.run-title-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.6rem;
		white-space: nowrap;
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
		color: var(--white);
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

	/* ── Lane tabs ── */
	.lane-tabs {
		display: flex;
		gap: 2px;
		padding: 0.5rem 1rem 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-top: none;
		border-bottom: none;
	}
	.lane-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.375rem 0.875rem;
		border: 1px solid transparent;
		border-bottom: none;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		background: transparent;
		font-family: var(--font-body);
		font-size: 0.8rem;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color var(--duration-fast),
			background var(--duration-fast),
			border-color var(--duration-fast);
		white-space: nowrap;
	}
	.lane-tab:hover {
		color: var(--text);
		background: var(--bg-subtle);
	}
	.lane-tab.active {
		color: var(--text);
		background: var(--bg-elevated);
		border-color: var(--border);
		border-bottom-color: var(--bg-elevated);
	}
	.tab-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--accent);
	}
	.tab-dot-running {
		background: var(--accent);
		animation: dotPulse 1.6s ease-in-out infinite;
	}
	.tab-dot-done {
		background: var(--pass);
	}
	.tab-dot-error {
		background: var(--fail);
	}
	.tab-count {
		font-size: 0.65rem;
		font-weight: 600;
		font-family: 'JetBrains Mono', monospace;
		opacity: 0.55;
	}

	/* ── Dual-stream view ── */
	.run-view {
		display: grid;
		grid-template-columns: 1fr 420px;
		height: calc(100vh - 290px);
		min-height: 380px;
		border: 1px solid var(--border);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		border-top: none;
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) 0.05s both;
	}
	.run-view.no-top-radius {
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}

	/* ── Screenshot panel ── */
	.screenshot-panel {
		position: relative;
		background: var(--terminal-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-right: 1px solid var(--border);
	}

	.live-shot {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
		border-radius: 2px;
	}

	.step-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 1.25rem 1rem 0.625rem;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		pointer-events: none;
	}
	.step-keyword {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--accent);
		flex-shrink: 0;
	}
	.step-name {
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.85);
		font-family: 'JetBrains Mono', monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.awaiting-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', monospace;
	}

	/* ── Terminal panel ── */
	.terminal-panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.terminal-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.6rem 0.875rem;
		background: rgba(0, 0, 0, 0.35);
		flex-shrink: 0;
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
		flex: 1;
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
</style>
