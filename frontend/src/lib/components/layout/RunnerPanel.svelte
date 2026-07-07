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
	import { onMount, onDestroy } from 'svelte';
	import { fly, slide } from 'svelte/transition';
	import { io } from 'socket.io-client';
	import {
		socket,
		runnerState,
		runnerConfig,
		panelExpanded,
		builtInEnabled,
		triggerRun,
		testsVersion,
		reportsVersion,
		runsVersion,
		activeCronJobs
	} from '$lib/stores/runner';
	import { fetchLatestReportId, reportUrl } from '$lib/api/reports';
	import { fetchRunners } from '$lib/api/runners';
	import { fetchRuns, fetchRun } from '$lib/api/repository';
	import { fetchIntegrations } from '$lib/api/settings';
	import {
		API_BASE,
		BROWSERS,
		BUILTIN_RUNNER_ID,
		BUILTIN_RUNNER_LABEL,
		WORKERS_MIN,
		WORKERS_MAX,
		RUN_PICKER_LIMIT,
		RUN_TAG_DISPLAY_LIMIT,
		ALL_TESTS_LABEL
	} from '$lib/constants';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	let availableRunners = [];
	let testRuns = [];
	let selectedRun = null; // { id, title, tags: string[] | null }
	let selectedRunLoading = false;
	let browserOpen = false;
	let runnersOpen = false;
	let runPickOpen = false;
	let runAllModalOpen = false;
	let integrations = { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	let notifyDiscord = false;
	let notifySlack = false;

	function clickOutside(node) {
		function handle(e) {
			if (!node.contains(e.target)) node.dispatchEvent(new CustomEvent('clickoutside'));
		}
		document.addEventListener('click', handle, true);
		return {
			destroy() {
				document.removeEventListener('click', handle, true);
			}
		};
	}

	let _unsubConfig, _unsubExpanded, _unsubBuiltIn, _socket;

	onMount(() => {
		try {
			const saved = localStorage.getItem('plum:runnerConfig');
			if (saved) runnerConfig.update((c) => ({ ...c, ...JSON.parse(saved) }));
		} catch {}
		try {
			const exp = localStorage.getItem('plum:panelExpanded');
			if (exp !== null) panelExpanded.set(exp === 'true');
		} catch {}
		try {
			const bi = localStorage.getItem('plum:builtInEnabled');
			if (bi !== null) builtInEnabled.set(bi !== 'false');
		} catch {}

		fetchRunners()
			.then((r) => {
				availableRunners = r;
				// Drop any saved selection pointing at runners that no longer exist,
				// so a deleted runner can't linger in the selection and break runs.
				const validIds = new Set([BUILTIN_RUNNER_ID, ...r.map((x) => x.id)]);
				runnerConfig.update((c) => {
					const pruned = c.selectedRunners.filter((id) => validIds.has(id));
					return { ...c, selectedRunners: pruned.length > 0 ? pruned : [BUILTIN_RUNNER_ID] };
				});
			})
			.catch(() => {});

		fetchIntegrations()
			.then((i) => (integrations = i))
			.catch(() => {});

		_unsubConfig = runnerConfig.subscribe((v) => {
			try {
				localStorage.setItem('plum:runnerConfig', JSON.stringify(v));
			} catch {}
		});
		_unsubExpanded = panelExpanded.subscribe((v) => {
			try {
				localStorage.setItem('plum:panelExpanded', String(v));
			} catch {}
		});
		_unsubBuiltIn = builtInEnabled.subscribe((v) => {
			try {
				localStorage.setItem('plum:builtInEnabled', String(v));
			} catch {}
			runnerConfig.update((c) => {
				if (!v && c.selectedRunners.includes(BUILTIN_RUNNER_ID)) {
					const others = c.selectedRunners.filter((r) => r !== BUILTIN_RUNNER_ID);
					const fallback =
						others.length > 0 ? others : availableRunners[0] ? [availableRunners[0].id] : [];
					return { ...c, selectedRunners: fallback };
				}
				return c;
			});
		});

		const s = io(API_BASE, { transports: ['websocket'] });
		_socket = s;
		socket.set(s);

		s.on('log', (data) => {
			runnerState.update((r) => ({ ...r, output: r.output + data + '\n' }));
		});

		s.on('done', (payload) => {
			// Distributed runs send { code, reportId }; the built-in path sends a bare code.
			const code = typeof payload === 'object' && payload !== null ? payload.code : payload;
			const providedId =
				typeof payload === 'object' && payload !== null ? payload.reportId : undefined;
			const passed = code === 0 || code === null;
			const cancelled = code === 130;
			const resolveId =
				providedId !== undefined && providedId !== null
					? Promise.resolve(providedId)
					: fetchLatestReportId().catch(() => null);
			resolveId.then((id) => {
				runnerState.update((r) => ({
					...r,
					output:
						r.output +
						(cancelled ? '' : passed ? '\n✓ All tests passed\n' : '\n✗ Some tests failed\n'),
					running: false,
					testCompleted: !cancelled,
					latestReportId: cancelled ? null : id,
					status: cancelled ? 'idle' : passed ? 'pass' : 'fail',
					currentRun: cancelled ? null : r.currentRun
				}));
			});
		});

		s.on('runner-lanes-init', (lanes) => {
			runnerState.update((r) => ({
				...r,
				lanes: lanes.map((l) => ({ ...l, status: 'running', logs: '', latestScreenshot: null }))
			}));
		});

		s.on('runner-lane-log', ({ id, log }) => {
			runnerState.update((r) => ({
				...r,
				lanes: r.lanes.map((l) => (l.id === id ? { ...l, logs: l.logs + log } : l))
			}));
		});

		s.on('runner-lane-status', ({ id, status }) => {
			runnerState.update((r) => ({
				...r,
				lanes: r.lanes.map((l) => (l.id === id ? { ...l, status } : l))
			}));
		});

		s.on('step-screenshot', ({ stepName, data }) => {
			runnerState.update((r) => ({ ...r, latestScreenshot: { stepName, data } }));
		});

		s.on('runner-lane-screenshot', ({ id, stepName, data }) => {
			runnerState.update((r) => ({
				...r,
				lanes: r.lanes.map((l) =>
					l.id === id ? { ...l, latestScreenshot: { stepName, data } } : l
				)
			}));
		});

		s.on('tests-changed', () => testsVersion.update((v) => v + 1));
		s.on('report-ready', () => reportsVersion.update((v) => v + 1));

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
	});

	onDestroy(() => {
		_unsubConfig?.();
		_unsubExpanded?.();
		_unsubBuiltIn?.();
		_socket?.disconnect();
	});

	$: state = $runnerState;
	$: cfg = $runnerConfig;

	$: truncatedRunTag = (() => {
		if (!state.currentRun?.tag) return ALL_TESTS_LABEL;
		const parts = state.currentRun.tag.split(/ or /i);
		if (parts.length <= RUN_TAG_DISPLAY_LIMIT) return state.currentRun.tag;
		return (
			parts.slice(0, RUN_TAG_DISPLAY_LIMIT).join(' or ') +
			` +${parts.length - RUN_TAG_DISPLAY_LIMIT} more`
		);
	})();
	$: cronJobs = Object.keys($activeCronJobs);
	$: anyCronRunning = cronJobs.length > 0;
	$: anyRunning = state.running || anyCronRunning;

	$: if ($runsVersion >= 0)
		fetchRuns({ limit: RUN_PICKER_LIMIT })
			.then((r) => (testRuns = r.runs))
			.catch(() => {});

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

	$: statusLabel = state.running
		? 'Running'
		: state.status === 'pass'
			? 'Passed'
			: state.status === 'fail'
				? 'Failed'
				: anyCronRunning
					? 'Scheduled'
					: 'Ready';

	$: currentBrowser = BROWSERS.find((b) => b.id === cfg.browser) ?? BROWSERS[0];

	$: runnerSummary =
		cfg.selectedRunners.length === 1 && cfg.selectedRunners[0] === BUILTIN_RUNNER_ID
			? BUILTIN_RUNNER_LABEL
			: cfg.selectedRunners.length === 1
				? (availableRunners.find((r) => r.id === cfg.selectedRunners[0])?.name ?? '1 node')
				: `${cfg.selectedRunners.length} nodes`;

	async function selectRun(run) {
		runPickOpen = false;
		selectedRun = { id: run.id, title: run.title, tags: null };
		selectedRunLoading = true;
		try {
			const full = await fetchRun(run.id);
			const tags = full.entries
				.filter((e) => e.case?.isAutomated)
				.map((e) => `@${e.case.displayId}`);
			selectedRun = { id: run.id, title: run.title, tags };
		} catch {
			selectedRun = null;
		} finally {
			selectedRunLoading = false;
		}
	}

	function clearSelectedRun() {
		selectedRun = null;
	}

	function handleRunClick() {
		const notify = { notifyDiscord, notifySlack };
		if (selectedRun) {
			if (selectedRunLoading || !selectedRun.tags) return;
			if (selectedRun.tags.length === 0) return;
			triggerRun(selectedRun.tags.join(' or '), selectedRun.id, notify, selectedRun.title);
		} else if ($runnerConfig.testID.trim() === '') {
			runAllModalOpen = true;
		} else {
			triggerRun(undefined, undefined, notify);
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Enter' && !state.running && !selectedRun) handleRunClick();
	}

	function adjustWorkers(delta) {
		runnerConfig.update((c) => ({
			...c,
			workers: Math.max(WORKERS_MIN, Math.min(WORKERS_MAX, c.workers + delta))
		}));
	}

	function toggleRunner(id) {
		runnerConfig.update((c) => {
			const current = c.selectedRunners;
			if (current.includes(id) && current.length === 1) return c;
			const next = current.includes(id) ? current.filter((r) => r !== id) : [...current, id];
			return { ...c, selectedRunners: next };
		});
	}

	function isRunnerSelected(id) {
		return $runnerConfig.selectedRunners.includes(id);
	}
</script>

<!-- Run all disclaimer -->
<ConfirmModal
	bind:open={runAllModalOpen}
	title="Run all tests?"
	confirmLabel="Run all tests"
	on:confirm={() => {
		runAllModalOpen = false;
		triggerRun(undefined, undefined, { notifyDiscord, notifySlack });
	}}
>
	No tag or filter is set. This will run <strong>every test</strong> in the suite, which may take a while.
</ConfirmModal>

<div class="panel" class:expanded={$panelExpanded}>
	<div
		class="scan-line"
		class:scanning={state.running}
		class:line-pass={state.status === 'pass' && !state.running}
		class:line-fail={state.status === 'fail' && !state.running}
	></div>

	<!-- ── Control bar ── -->
	<div class="bar">
		<!-- Left: status + view report -->
		<div class="bar-left">
			<div class="bar-status">
				<span class="status-dot" class:pulse={state.running} style="background:{statusColor}"
				></span>
				<span class="status-word" style="color:{statusColor}">{statusLabel}</span>
				{#if state.lastRunId || state.currentRun?.runTitle}
					<span class="run-tag">{state.currentRun?.runTitle || state.lastRunId}</span>
				{/if}
			</div>
			{#if state.testCompleted && state.latestReportId}
				<a
					href={reportUrl(state.latestReportId)}
					class="view-report-btn"
					transition:fly={{ x: -6, duration: 200 }}
				>
					View Report
					<svg
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
					</svg>
				</a>
			{/if}
		</div>

		<span class="flex-gap"></span>

		<!-- Middle: tag filter + browser + workers + runner dropdowns -->
		<div class="bar-center">
			<!-- Test Run picker OR tag input -->
			{#if selectedRun}
				<div class="run-chip" class:loading={selectedRunLoading}>
					<svg
						width="9"
						height="10"
						viewBox="0 0 10 12"
						fill="currentColor"
						stroke="none"
						style="opacity:0.6;flex-shrink:0"><polygon points="0,0 10,6 0,12" /></svg
					>
					<span class="run-chip-title">{selectedRun.title}</span>
					{#if selectedRunLoading}
						<span class="run-chip-spinner"></span>
					{:else if selectedRun.tags !== null}
						<span class="run-chip-count" class:none={selectedRun.tags.length === 0}>
							{selectedRun.tags.length} automated
						</span>
					{/if}
					<button class="run-chip-clear" on:click={clearSelectedRun} aria-label="Clear test run">
						<svg width="9" height="9" viewBox="0 0 14 14" fill="none"
							><path
								d="M1 1l12 12M13 1L1 13"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/></svg
						>
					</button>
				</div>
			{:else}
				<div class="input-wrap">
					<svg
						class="input-icon"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						class="tag-input"
						value={$runnerConfig.testID}
						placeholder="@tag or leave blank for all tests"
						on:input={(e) => runnerConfig.update((c) => ({ ...c, testID: e.currentTarget.value }))}
						on:keydown={handleKeydown}
						disabled={state.running}
					/>
				</div>
			{/if}

			<!-- Test run dropdown -->
			<div class="ctrl-group">
				<span class="ctrl-label">Test Run</span>
				<div class="dropdown-wrap" use:clickOutside on:clickoutside={() => (runPickOpen = false)}>
					<button
						class="dropdown-trigger"
						class:open={runPickOpen}
						class:has-remote={!!selectedRun}
						on:click={() => {
							if (!state.running) runPickOpen = !runPickOpen;
						}}
						disabled={state.running}
					>
						<span>{selectedRun ? selectedRun.title : 'None'}</span>
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							class="trigger-chevron"
							class:open={runPickOpen}
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{#if runPickOpen}
						<div class="dropdown-menu run-pick-menu" transition:fly={{ y: 6, duration: 130 }}>
							{#if selectedRun}
								<button class="dropdown-item" on:click={clearSelectedRun}>
									<span style="color:var(--text-muted)">✕</span> Clear
								</button>
								<div class="dropdown-divider"></div>
							{/if}
							{#if testRuns.filter((r) => r.status !== 'complete').length === 0}
								<div class="dropdown-empty">No active test runs</div>
							{:else}
								{#each testRuns.filter((r) => r.status !== 'complete') as run}
									<button
										class="dropdown-item"
										class:active={selectedRun?.id === run.id}
										on:click={() => selectRun(run)}
									>
										{run.title}
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<div class="ctrl-divider"></div>

			<!-- Workers stepper -->
			<div class="ctrl-group">
				<span class="ctrl-label">Workers</span>
				<div class="stepper">
					<button
						class="step-btn"
						on:click={() => adjustWorkers(-1)}
						disabled={cfg.workers <= WORKERS_MIN || state.running}>−</button
					>
					<span class="step-val">{cfg.workers}</span>
					<button
						class="step-btn"
						on:click={() => adjustWorkers(1)}
						disabled={cfg.workers >= WORKERS_MAX || state.running}>+</button
					>
				</div>
			</div>

			<div class="ctrl-divider"></div>

			<!-- Browser -->
			<div class="ctrl-group">
				<span class="ctrl-label">Browser</span>
				<div class="dropdown-wrap" use:clickOutside on:clickoutside={() => (browserOpen = false)}>
					<button
						class="dropdown-trigger"
						class:open={browserOpen}
						on:click={() => {
							if (!state.running) browserOpen = !browserOpen;
						}}
						disabled={state.running}
					>
						<span>{currentBrowser.label}</span>
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							class="trigger-chevron"
							class:open={browserOpen}
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{#if browserOpen}
						<div class="dropdown-menu" transition:fly={{ y: 6, duration: 130 }}>
							{#each BROWSERS as b}
								<button
									class="dropdown-item"
									class:active={cfg.browser === b.id}
									on:click={() => {
										runnerConfig.update((c) => ({ ...c, browser: b.id }));
										browserOpen = false;
									}}
								>
									{b.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Runners (only when external runners exist) -->
			{#if availableRunners.length > 0}
				<div class="ctrl-divider"></div>
				<div class="ctrl-group">
					<span class="ctrl-label">Runners</span>
					<div class="dropdown-wrap" use:clickOutside on:clickoutside={() => (runnersOpen = false)}>
						<button
							class="dropdown-trigger"
							class:open={runnersOpen}
							class:has-remote={cfg.selectedRunners.some((r) => r !== BUILTIN_RUNNER_ID)}
							on:click={() => {
								if (!state.running) runnersOpen = !runnersOpen;
							}}
							disabled={state.running}
						>
							<span>{runnerSummary}</span>
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								class="trigger-chevron"
								class:open={runnersOpen}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{#if runnersOpen}
							<div class="dropdown-menu runners-menu" transition:fly={{ y: 6, duration: 130 }}>
								{#if $builtInEnabled || isRunnerSelected(BUILTIN_RUNNER_ID)}
									<label class="runner-option">
										<input
											type="checkbox"
											checked={isRunnerSelected(BUILTIN_RUNNER_ID)}
											on:change={() => toggleRunner(BUILTIN_RUNNER_ID)}
										/>
										<span class="runner-dot built-in"></span>
										<span>{BUILTIN_RUNNER_LABEL}</span>
									</label>
								{/if}
								{#each availableRunners as r}
									<label class="runner-option">
										<input
											type="checkbox"
											checked={isRunnerSelected(r.id)}
											on:change={() => toggleRunner(r.id)}
										/>
										<span class="runner-dot remote"></span>
										<span>{r.name}</span>
									</label>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			{#if integrations.discordWebhookUrl || integrations.slackWebhookUrl}
				<div class="ctrl-divider"></div>
				<div class="ctrl-group">
					<span class="ctrl-label">Notify</span>
					<div class="notify-toggles">
						{#if integrations.discordWebhookUrl}
							<button
								type="button"
								class="notify-btn"
								class:active={notifyDiscord}
								on:click={() => (notifyDiscord = !notifyDiscord)}
								title={notifyDiscord ? 'Discord notification on' : 'Discord notification off'}
								disabled={state.running}>Discord</button
							>
						{/if}
						{#if integrations.slackWebhookUrl}
							<button
								type="button"
								class="notify-btn"
								class:active={notifySlack}
								on:click={() => (notifySlack = !notifySlack)}
								title={notifySlack ? 'Slack notification on' : 'Slack notification off'}
								disabled={state.running}>Slack</button
							>
						{/if}
					</div>
				</div>
			{/if}

			<div class="ctrl-divider"></div>

			<!-- Run button -->
			<button
				class="run-btn"
				class:is-running={state.running}
				on:click={handleRunClick}
				disabled={state.running ||
					selectedRunLoading ||
					(selectedRun && selectedRun.tags?.length === 0)}
				title={selectedRun && selectedRun.tags?.length === 0
					? 'No automated cases in this run'
					: undefined}
			>
				{#if state.running}
					<span class="run-spinner"></span>
					Running
				{:else}
					<svg width="9" height="10" viewBox="0 0 10 12" fill="currentColor" stroke="none">
						<polygon points="0,0 10,6 0,12" />
					</svg>
					Run
				{/if}
			</button>
		</div>

		<span class="flex-gap-sm"></span>

		<!-- Right: expand toggle -->
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
				class:flipped={$panelExpanded}
			>
				<polyline points="18 15 12 9 6 15" />
			</svg>
		</button>
	</div>

	<!-- ── Expanded: active runs only ── -->
	{#if $panelExpanded}
		<div class="body" transition:slide={{ duration: 200 }}>
			{#if state.running}
				<!-- Manual test running -->
				<a href="/reports/live" class="run-card active-run">
					<span class="run-card-dot pulse-accent"></span>
					<div class="run-card-info">
						<span class="run-card-label">{state.currentRun?.runTitle || 'Manual run'}</span>
						{#if state.currentRun}
							<span class="run-card-meta">
								{truncatedRunTag}
								<span class="meta-dot">·</span>
								{state.currentRun.workers}w
								<span class="meta-dot">·</span>
								{state.currentRun.browser}
								{#if state.currentRun.runners?.length > 1}
									<span class="meta-dot">·</span>
									{state.currentRun.runners.length} runners
								{/if}
							</span>
						{/if}
					</div>
					<Badge variant="tag">Live</Badge>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						class="run-card-arrow"
					>
						<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
					</svg>
				</a>
			{/if}

			{#each cronJobs as name}
				<a href="/reports/live" class="run-card cron-run" transition:fly={{ x: -4, duration: 160 }}>
					<span class="run-card-dot pulse-pass"></span>
					<div class="run-card-info">
						<span class="run-card-label">{name}</span>
						<span class="run-card-meta">Scheduled run</span>
					</div>
					<Badge variant="schedule">Scheduled</Badge>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						class="run-card-arrow"
					>
						<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
					</svg>
				</a>
			{/each}

			{#if !anyRunning}
				<div class="empty-runs">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="empty-icon"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="10" y1="15" x2="10" y2="12" />
						<line x1="10" y1="9" x2="10.01" y2="9" />
					</svg>
					No tests currently running
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* ── Panel shell ── */
	.panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 200;
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.07);
	}

	/* ── Scan-line ── */
	.scan-line {
		height: 2px;
		background: var(--border);
		transition: background 0.5s ease;
		overflow: hidden;
		position: relative;
	}

	.scan-line.scanning {
		background: color-mix(in srgb, var(--accent) 30%, var(--border));
	}

	.scan-line.scanning::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 35%;
		background: linear-gradient(90deg, transparent, var(--accent), transparent);
		animation: scan 1.8s ease-in-out infinite;
	}

	.scan-line.line-pass {
		background: var(--pass);
	}
	.scan-line.line-fail {
		background: var(--fail);
	}

	@keyframes scan {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	/* ── Bar ── */
	.bar {
		display: flex;
		align-items: center;
		height: 52px;
		padding: 0 1rem 0 1.25rem;
		gap: 0.75rem;
	}

	.flex-gap {
		flex: 1;
	}
	.flex-gap-sm {
		width: 0.5rem;
	}

	/* ── Left: status ── */
	.bar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.bar-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		transition: background 0.4s ease;
	}

	.status-dot.pulse {
		animation: dotPulse 1.6s ease-in-out infinite;
	}

	.status-word {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		transition: color 0.4s ease;
		white-space: nowrap;
	}

	.run-tag {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.45rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 160px;
	}

	.view-report-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--accent);
		text-decoration: none;
		white-space: nowrap;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.6rem;
		background: var(--accent-soft);
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.view-report-btn:hover {
		background: var(--accent);
		color: var(--white);
	}

	/* ── Center: controls ── */
	.bar-center {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	/* Tag input */
	.input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-icon {
		position: absolute;
		left: 0.6rem;
		color: var(--text-muted);
		pointer-events: none;
		opacity: 0.6;
	}

	.tag-input {
		height: 28px;
		padding: 0 0.75rem 0 2rem;
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', monospace;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		outline: none;
		transition: border-color var(--duration-fast);
		width: 200px;
	}

	.tag-input:focus {
		border-color: var(--accent);
	}
	.tag-input::placeholder {
		color: var(--text-muted);
		opacity: 0.45;
	}
	.tag-input:disabled {
		opacity: 0.45;
	}

	.ctrl-divider {
		width: 1px;
		height: 24px;
		background: var(--border);
		flex-shrink: 0;
	}

	/* Workers stepper */
	.ctrl-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.ctrl-label {
		font-size: 0.555rem;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--text-muted);
		opacity: 0.65;
		line-height: 1;
	}

	.stepper {
		display: flex;
		align-items: center;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.step-btn {
		width: 20px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 400;
		line-height: 1;
		transition:
			color var(--duration-fast),
			background var(--duration-fast);
	}

	.step-btn:hover:not(:disabled) {
		color: var(--text);
		background: var(--bg-elevated);
	}
	.step-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.step-val {
		min-width: 20px;
		text-align: center;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text);
		font-family: 'JetBrains Mono', monospace;
		line-height: 24px;
		border-left: 1px solid var(--border);
		border-right: 1px solid var(--border);
	}

	/* Dropdown */
	.dropdown-wrap {
		position: relative;
	}

	.dropdown-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		height: 24px;
		padding: 0 0.5rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--text);
		cursor: pointer;
		transition:
			border-color var(--duration-fast),
			background var(--duration-fast),
			color var(--duration-fast);
		white-space: nowrap;
	}

	.dropdown-trigger:hover:not(:disabled) {
		border-color: color-mix(in srgb, var(--text-muted) 50%, var(--border));
	}
	.dropdown-trigger.open {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.dropdown-trigger.has-remote {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-soft);
	}
	.dropdown-trigger:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.trigger-chevron {
		transition: transform 0.18s var(--ease-out);
		flex-shrink: 0;
	}
	.trigger-chevron.open {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		min-width: 130px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.13);
		padding: 0.3rem;
		z-index: 300;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.5rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition: background var(--duration-fast);
	}

	.dropdown-item:hover {
		background: var(--bg-subtle);
	}
	.dropdown-item.active {
		color: var(--accent);
	}

	.runners-menu {
		min-width: 160px;
	}

	.runner-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.8125rem;
		color: var(--text);
		transition: background var(--duration-fast);
	}

	.runner-option:hover {
		background: var(--bg-subtle);
	}
	.runner-option input[type='checkbox'] {
		accent-color: var(--accent);
		width: 13px;
		height: 13px;
		cursor: pointer;
		flex-shrink: 0;
	}
	.runner-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.runner-dot.built-in {
		background: var(--accent);
	}
	.runner-dot.remote {
		background: var(--pass);
	}

	/* Run button */
	.run-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: 30px;
		padding: 0 0.875rem;
		background: var(--accent);
		color: var(--white);
		border: none;
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity var(--duration-fast);
		flex-shrink: 0;
	}

	.run-btn:hover:not(:disabled) {
		opacity: 0.88;
	}
	.run-btn:disabled,
	.run-btn.is-running {
		opacity: 0.6;
		cursor: default;
	}

	.run-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(255, 255, 255, 0.35);
		border-top-color: var(--white);
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Notification toggles */
	.notify-toggles {
		display: flex;
		gap: 0.25rem;
	}

	.notify-btn {
		height: 26px;
		padding: 0 0.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-family: inherit;
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.notify-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-muted);
	}

	.notify-btn.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--white);
	}

	.notify-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Expand button */
	.expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
		flex-shrink: 0;
	}

	.expand-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
		border-color: var(--text-muted);
	}
	.expand-btn svg {
		transition: transform 0.2s var(--ease-out);
	}
	.expand-btn svg.flipped {
		transform: rotate(180deg);
	}

	/* ── Expanded body ── */
	.body {
		border-top: 1px solid var(--border);
		padding: 0.625rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-height: 72px;
	}

	/* Active run card */
	.run-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-subtle);
		text-decoration: none;
		color: inherit;
		transition:
			background var(--duration-fast),
			border-color var(--duration-fast);
	}

	a.run-card:hover {
		background: var(--bg-elevated);
		border-color: var(--accent);
	}

	.run-card.active-run {
		border-left: 3px solid var(--accent);
	}
	.run-card.cron-run {
		border-left: 3px solid var(--warn);
	}

	.run-card-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.pulse-accent {
		background: var(--accent);
		animation: dotPulse 1.6s ease-in-out infinite;
	}

	.pulse-pass {
		background: var(--pass);
		animation: dotPulse 1.6s ease-in-out infinite;
	}

	.run-card-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1;
		min-width: 0;
	}

	.run-card-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.run-card-meta {
		font-size: 0.72rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-dot {
		opacity: 0.4;
		margin: 0 0.15rem;
	}

	.run-card-arrow {
		color: var(--text-muted);
		flex-shrink: 0;
		transition:
			transform var(--duration-fast) var(--ease-out),
			color var(--duration-fast);
	}

	a.run-card:hover .run-card-arrow {
		transform: translateX(3px);
		color: var(--accent);
	}

	/* Empty state */
	.empty-runs {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.empty-icon {
		opacity: 0.4;
	}

	/* ── Run chip (selected test run display) ── */
	.run-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: 28px;
		padding: 0 0.5rem 0 0.625rem;
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		color: var(--accent);
		font-size: 0.78rem;
		white-space: nowrap;
		max-width: 200px;
	}

	.run-chip-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.run-chip-count {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		opacity: 0.75;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.run-chip-count.none {
		color: var(--fail);
		opacity: 1;
	}

	.run-chip-spinner {
		width: 9px;
		height: 9px;
		border: 1.5px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
		flex-shrink: 0;
	}

	.run-chip-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: none;
		background: transparent;
		color: var(--accent);
		cursor: pointer;
		border-radius: 2px;
		opacity: 0.7;
		padding: 0;
		flex-shrink: 0;
		transition: opacity var(--duration-fast);
	}

	.run-chip-clear:hover {
		opacity: 1;
	}

	.run-pick-menu {
		min-width: 180px;
		max-height: 240px;
		overflow-y: auto;
	}

	.dropdown-divider {
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
	}

	.dropdown-empty {
		font-size: 0.8125rem;
		color: var(--text-muted);
		padding: 0.35rem 0.5rem;
		text-align: center;
		opacity: 0.7;
	}
</style>
