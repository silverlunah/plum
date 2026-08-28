<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { afterUpdate, onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';
	import { backgroundRuns, cancelRun } from '$lib/stores/runner';
	import { fetchActiveRuns } from '$lib/api/activeRuns';
	import { reportUrl } from '$lib/api/reports';
	import { REDIRECT_DELAY_MS } from '$lib/constants';
	import LiveReplayer from '$lib/components/reports/LiveReplayer.svelte';
	import { ALL_TESTS_LABEL } from '$lib/copy/common';
	import {
		REPORTS_BACK_LABEL,
		PASSED_LABEL,
		FAILED_LABEL,
		LIVE_PAGE_TITLE,
		LIVE_BADGE_LABEL,
		CANCEL_RUN_LABEL,
		ALL_TESTS_PASSED,
		SOME_TESTS_FAILED,
		VIEW_REPORT_NOW_LABEL,
		AWAITING_STREAM_LABEL,
		NO_STREAM_LABEL,
		RUNNER_LABEL,
		RUNNING_LABEL,
		FINISHED_LABEL,
		WAITING_FOR_OUTPUT,
		QUEUED_HEADING,
		QUEUED_BODY,
		RUN_NOT_FOUND_HEADING,
		RUN_NOT_FOUND_BODY,
		RUN_SKIPPED_HEADING,
		VIEW_PAST_REPORTS_LINK,
		queuePositionLine,
		workersCountLabel,
		redirectingIn,
		runnersBadge,
		workerLabel
	} from '$lib/copy/reports';
	import BackLink from '$lib/components/ui/BackLink.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	let terminalEl;
	let laneTerminalEl;
	let redirectTimer = null;
	let redirectCountdown = REDIRECT_DELAY_MS / 1000;
	let countdownInterval = null;
	let activeTab = null;
	let activeWorkerId = null;
	let hydrated = false;
	let queuePosition = 0;
	let posInterval = null;

	$: runId = $page.params.id;
	$: run = $backgroundRuns[runId] ?? null;
	$: status = run?.status ?? null;
	$: lanes = run?.lanes ?? [];
	$: isMulti = lanes.length > 1;

	async function refreshQueuePosition() {
		try {
			const runs = await fetchActiveRuns();
			hydrated = true;
			const mine = runs.find((r) => r.runId === runId);
			queuePosition = mine?.position ?? 0;
		} catch {
			hydrated = true;
		}
	}

	onMount(() => {
		refreshQueuePosition();
		posInterval = setInterval(() => {
			if (status === 'queued') refreshQueuePosition();
		}, 4000);
	});

	// Keep active tab pointing at a valid lane
	$: {
		if (lanes.length === 0) activeTab = null;
		else if (!lanes.find((l) => l.id === activeTab)) activeTab = lanes[0].id;
	}
	$: activeLane = lanes.find((l) => l.id === activeTab) ?? null;

	$: activeLaneId = isMulti ? activeTab : lanes[0]?.id;
	$: laneWorkers = (activeLaneId && run?.rrwebByLane[activeLaneId]) || {};
	$: workerIds = Object.keys(laneWorkers).sort((a, b) => Number(a) - Number(b));
	$: {
		if (workerIds.length === 0) activeWorkerId = null;
		else if (!workerIds.includes(activeWorkerId)) activeWorkerId = workerIds[0];
	}
	$: activeWorkerEvents = activeWorkerId ? (laneWorkers[activeWorkerId]?.events ?? []) : [];

	afterUpdate(() => {
		if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
		if (laneTerminalEl) laneTerminalEl.scrollTop = laneTerminalEl.scrollHeight;
	});

	$: if (status === 'done' && run?.testCompleted && run?.latestReportId && !redirectTimer) {
		redirectCountdown = REDIRECT_DELAY_MS / 1000;
		countdownInterval = setInterval(() => {
			redirectCountdown--;
			if (redirectCountdown <= 0) clearInterval(countdownInterval);
		}, 1000);
		redirectTimer = setTimeout(() => goto(reportUrl(run.latestReportId)), REDIRECT_DELAY_MS);
	}

	onDestroy(() => {
		if (redirectTimer) clearTimeout(redirectTimer);
		if (countdownInterval) clearInterval(countdownInterval);
		if (posInterval) clearInterval(posInterval);
	});

	function goNow() {
		if (redirectTimer) clearTimeout(redirectTimer);
		if (countdownInterval) clearInterval(countdownInterval);
		goto(reportUrl(run.latestReportId));
	}
</script>

<svelte:head><title>{LIVE_PAGE_TITLE}</title></svelte:head>

{#if !run}
	<BackLink href="/reports" label={REPORTS_BACK_LABEL} />
	<div class="notice-state">
		{#if hydrated}
			<h2>{RUN_NOT_FOUND_HEADING}</h2>
			<p>{RUN_NOT_FOUND_BODY}</p>
			<a href="/reports" class="notice-link">{VIEW_PAST_REPORTS_LINK}</a>
		{:else}
			<div class="pulse-dot"></div>
		{/if}
	</div>
{:else if status === 'queued'}
	<BackLink href="/reports" label={REPORTS_BACK_LABEL} />
	<div class="notice-state">
		<div class="pulse-dot warn"></div>
		<h2>{QUEUED_HEADING}</h2>
		<p>{QUEUED_BODY}</p>
		<p class="queue-pos">{queuePositionLine(queuePosition)}</p>
		<button class="cancel-btn" on:click={() => cancelRun(runId)}>{CANCEL_RUN_LABEL}</button>
	</div>
{:else if status === 'done' && !run.latestReportId}
	<BackLink href="/reports" label={REPORTS_BACK_LABEL} />
	<div class="notice-state">
		<h2>{run.verdict === 'cancelled' ? CANCEL_RUN_LABEL : RUN_SKIPPED_HEADING}</h2>
		<a href="/reports" class="notice-link">{VIEW_PAST_REPORTS_LINK}</a>
	</div>
{:else}
	<div class="live-fullscreen">
		<div
			class="run-header"
			class:header-pass={run.verdict === 'pass'}
			class:header-fail={run.verdict === 'fail'}
		>
			<div class="header-left">
				<div class="header-back">
					<BackLink href="/reports" label={REPORTS_BACK_LABEL} />
				</div>

				{#if status === 'running'}
					<span class="live-badge"><span class="live-dot"></span>{LIVE_BADGE_LABEL}</span>
				{:else if run.verdict === 'pass'}
					<Badge variant="pass">{PASSED_LABEL}</Badge>
				{:else}
					<Badge variant="fail">{FAILED_LABEL}</Badge>
				{/if}

				{#if run.currentRun}
					<div class="run-info">
						{#if run.currentRun.runTitle}
							<span class="run-title-label">{run.currentRun.runTitle}</span>
							<span class="run-sep">·</span>
						{/if}
						<span class="run-tag-label">{run.currentRun.tag || ALL_TESTS_LABEL}</span>
						<span class="run-sep">·</span>
						<span class="run-detail">{workersCountLabel(run.currentRun.workers)}</span>
						<span class="run-sep">·</span>
						<span class="run-detail">{run.currentRun.browser}</span>
						{#if lanes.length > 1}
							<span class="run-sep">·</span>
							<span class="run-detail">{runnersBadge(lanes.length)}</span>
						{/if}
					</div>
				{/if}
			</div>

			{#if status === 'running'}
				<button class="cancel-btn" on:click={() => cancelRun(runId)}>
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
					{CANCEL_RUN_LABEL}
				</button>
			{/if}
		</div>

		{#if status === 'done' && run.testCompleted && run.latestReportId}
			<div
				class="completion-bar"
				class:pass-bar={run.verdict === 'pass'}
				class:fail-bar={run.verdict === 'fail'}
				transition:fly={{ y: -8, duration: 250 }}
			>
				<div class="completion-left">
					{#if run.verdict === 'pass'}
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
						{ALL_TESTS_PASSED}
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
						{SOME_TESTS_FAILED}
					{/if}
				</div>
				<div class="completion-right">
					<span class="redirect-hint">{redirectingIn(redirectCountdown)}</span>
					<button class="view-now-btn" on:click={goNow}>
						{VIEW_REPORT_NOW_LABEL}
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

		{#if isMulti}
			<div class="lane-tabs">
				{#each lanes as lane}
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

		{#if workerIds.length > 1}
			<div class="lane-tabs worker-tabs">
				{#each workerIds as workerId}
					<button
						class="lane-tab"
						class:active={activeWorkerId === workerId}
						on:click={() => (activeWorkerId = workerId)}
					>
						{workerLabel(workerId)}
					</button>
				{/each}
			</div>
		{/if}

		<div class="run-view">
			<div class="stream-panel">
				{#if activeWorkerEvents.length > 0}
					<LiveReplayer events={activeWorkerEvents} />
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
						<span>{status === 'running' ? AWAITING_STREAM_LABEL : NO_STREAM_LABEL}</span>
					</div>
				{/if}
			</div>

			<div class="terminal-panel">
				<div class="terminal-bar">
					<span class="dot red"></span>
					<span class="dot yellow"></span>
					<span class="dot green"></span>
					<span class="terminal-label">
						{#if isMulti}
							{activeLane?.name ?? RUNNER_LABEL}
						{:else}
							{status === 'running' ? RUNNING_LABEL : FINISHED_LABEL}
						{/if}
					</span>
				</div>
				{#if isMulti}
					<pre class="terminal" bind:this={laneTerminalEl}>{activeLane?.logs ||
							WAITING_FOR_OUTPUT}</pre>
				{:else}
					<pre class="terminal" bind:this={terminalEl}>{lanes[0]?.logs ||
							run.output ||
							WAITING_FOR_OUTPUT}</pre>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.notice-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 5rem 1rem;
		text-align: center;
		gap: 0.75rem;
	}
	.notice-state h2 {
		font-size: 1.5rem;
		font-weight: 400;
	}
	.notice-state p {
		font-size: 0.9375rem;
		color: var(--text-muted);
		max-width: 360px;
	}
	.queue-pos {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		color: var(--text);
	}
	.notice-link {
		font-size: 0.875rem;
		color: var(--accent);
		text-decoration: none;
		margin-top: 0.5rem;
	}
	.notice-link:hover {
		text-decoration: underline;
	}
	.pulse-dot {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse-dot 1.4s ease-in-out infinite;
	}
	.pulse-dot.warn {
		background: var(--warn);
	}
	@keyframes pulse-dot {
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

	.live-fullscreen {
		width: 100vw;
		position: relative;
		left: 50%;
		margin-left: -50vw;
		margin-top: -2.5rem;
		margin-bottom: -5rem;
		padding-bottom: 5rem;
		height: calc(100vh - 56px);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
	}

	.run-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem clamp(1rem, 3vw, 2rem);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border);
		animation: fadeUp 0.3s var(--ease-out) both;
		flex-shrink: 0;
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

	.header-back {
		display: flex;
		align-items: center;
		padding-right: 0.875rem;
		border-right: 1px solid var(--border);
	}
	.header-back :global(.back-row) {
		margin-bottom: 0;
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

	.completion-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem clamp(1rem, 3vw, 2rem);
		gap: 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.completion-bar.pass-bar {
		background: var(--pass-soft);
		border-bottom-color: color-mix(in srgb, var(--pass) 30%, var(--border));
		color: var(--pass);
	}
	.completion-bar.fail-bar {
		background: var(--fail-soft);
		border-bottom-color: color-mix(in srgb, var(--fail) 30%, var(--border));
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

	.lane-tabs {
		display: flex;
		gap: 2px;
		padding: 0.5rem clamp(1rem, 3vw, 2rem) 0;
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
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

	.run-view {
		display: grid;
		grid-template-columns: 1fr 340px;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) 0.05s both;
	}

	.stream-panel {
		position: relative;
		background: var(--terminal-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-right: 1px solid var(--border);
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
