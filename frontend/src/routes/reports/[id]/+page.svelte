<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { fetchReportDetail, fetchRecordings, downloadReportExport } from '$lib/api/reports';
	import {
		isScheduled,
		triggerLabel,
		mcpName,
		fmtDuration,
		stagger,
		featureFile,
		groupScenariosByRunnerAndWorker,
		parseRunnerLogs,
		featureSuiteTag,
		visibleTags
	} from '$lib/utils/format';
	import { BROWSERS } from '$lib/constants';
	import { pluralize } from '$lib/copy/common';
	import {
		DETAIL_PAGE_TITLE,
		REPORTS_BACK_LABEL,
		LOAD_ERROR,
		PASSED_LABEL,
		FAILED_LABEL,
		STAT_PASSED,
		STAT_FAILED,
		STAT_SKIPPED,
		STAT_DURATION,
		RUN_LOGS_LABEL,
		RETRY_TITLE,
		WATCH_REPLAY_TITLE,
		REPLAY_LABEL,
		runnersBadge,
		casesCountLabel,
		attemptsLabel,
		caseLabel,
		UNKNOWN_RUNNER_LABEL,
		workerLabel,
		REPORT_EXPORT_MENU_ITEMS
	} from '$lib/copy/reports';
	import { exportFailedToast, exportedToast, exportingToast } from '$lib/copy/common';
	import { notify, notifyProgress } from '$lib/stores/notifications';
	import Badge from '$lib/components/ui/Badge.svelte';
	import BackLink from '$lib/components/ui/BackLink.svelte';
	import ExportMenu from '$lib/components/ui/ExportMenu.svelte';
	import StatusDot from '$lib/components/ui/StatusDot.svelte';
	import TagChip from '$lib/components/ui/TagChip.svelte';
	import TagList from '$lib/components/ui/TagList.svelte';
	import StepKeyword from '$lib/components/ui/StepKeyword.svelte';
	import StepStatusIcon from '$lib/components/ui/StepStatusIcon.svelte';
	import BrowserIcon from '$lib/components/icons/BrowserIcon.svelte';
	import RecordingPlayer from '$lib/components/reports/RecordingPlayer.svelte';

	const reportId = parseInt($page.params.id, 10);

	let detail = null;
	let error = null;
	let expandedScenarios = new Set();

	// Replay state
	let allRecordings = [];
	let replayOpen = false;
	let replayScenario = null;
	let scenarioRecordings = [];
	let replayInspecting = false;

	let exporting = false;
	async function handleExport(format) {
		exporting = true;
		const settle = notifyProgress(exportingToast('Report'));
		try {
			await downloadReportExport(reportId, format);
			settle('success', exportedToast('Report'));
		} catch {
			settle('error', exportFailedToast('this report'));
		} finally {
			exporting = false;
		}
	}

	function scenarioHasRecording(scenario) {
		return allRecordings.some((r) => r.scenarioId === scenario.id);
	}

	function openReplay(scenario) {
		replayScenario = scenario;
		scenarioRecordings = allRecordings
			.filter((r) => r.scenarioId === scenario.id)
			.sort((a, b) => a.tabIndex - b.tabIndex);
		replayOpen = true;
	}

	function closeReplay() {
		replayOpen = false;
		replayScenario = null;
		scenarioRecordings = [];
	}

	function handleKeydown(e) {
		if (!replayOpen) return;
		// While inspecting, RecordingPlayer's own Escape handler turns inspect
		// mode off — only close the modal when that's not in play.
		if (e.key === 'Escape' && !replayInspecting) closeReplay();
	}

	onMount(async () => {
		try {
			detail = await fetchReportDetail(reportId);
			allRecordings = await fetchRecordings(reportId);
		} catch {
			error = LOAD_ERROR;
		}
	});

	function toggleScenario(id) {
		if (expandedScenarios.has(id)) expandedScenarios.delete(id);
		else expandedScenarios.add(id);
		expandedScenarios = expandedScenarios;
	}

	let activeLogTab = 0;
	$: logSections = parseRunnerLogs(detail?.logs ?? null);
	$: if (logSections) activeLogTab = 0;

	$: overallPass = detail?.status === 'PASS';
	$: allScenarios = detail?.features.flatMap((f) => f.scenarios) ?? [];
	$: passed = allScenarios.filter((s) => s.status === 'passed').length;
	$: failed = allScenarios.filter((s) => s.status === 'failed').length;
	$: skipped = allScenarios.filter((s) => s.status === 'skipped' || s.status === 'pending').length;
	// detail.duration is real wall-clock time (recorded by the orchestrator, start to
	// combined-report-save). Summed scenario durations overcount when scenarios ran in
	// parallel (multiple workers/runners) — only used as a fallback for reports saved
	// before this field existed.
	$: totalDuration = detail?.duration ?? allScenarios.reduce((s, sc) => s + sc.duration, 0);
	// `allRecordings` is referenced here (not just inside scenarioHasRecording)
	// purely so Svelte's compiler tracks it as a dependency — recordings load
	// asynchronously after `detail`, and without this the {@const groupHasReplay}
	// checks inside the each-block tree below never re-evaluate once they arrive.
	$: runnerGroups = detail && allRecordings ? groupScenariosByRunnerAndWorker(detail.features) : [];
</script>

<svelte:window on:keydown={handleKeydown} />

<svelte:head><title>{DETAIL_PAGE_TITLE}</title></svelte:head>

<div class="detail-top">
	<BackLink href="/reports" label={REPORTS_BACK_LABEL} />
	{#if detail}
		<ExportMenu
			items={REPORT_EXPORT_MENU_ITEMS}
			busy={exporting}
			on:select={(e) => handleExport(e.detail)}
		/>
	{/if}
</div>

{#if error}
	<div class="error-state">{error}</div>
{:else if !detail}
	<div class="loading-state">
		<div class="loading-dots"><span></span><span></span><span></span></div>
	</div>
{:else}
	<div class="report-header" class:pass={overallPass} class:fail={!overallPass}>
		<div class="header-main">
			<div class="header-status">
				<div class="status-icon-wrap" class:pass-bg={overallPass} class:fail-bg={!overallPass}>
					{#if overallPass}
						<svg
							width="26"
							height="26"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{:else}
						<svg
							width="26"
							height="26"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					{/if}
				</div>

				<div>
					<div class="h1-row">
						<h1>{overallPass ? PASSED_LABEL : FAILED_LABEL}</h1>
						{#if detail.testRun?.title}
							<span class="run-name-badge">{detail.testRun.title}</span>
						{:else if isScheduled(detail.triggerType)}
							<span class="run-name-badge">{detail.triggerType}</span>
						{/if}
					</div>
					<div class="header-meta">
						<span class="mono"><TagList value={detail.tags} /></span>
						<span class="meta-sep">·</span>
						<span>{triggerLabel(detail.triggerType)}</span>
						{#if detail.startedBy}
							<span class="meta-sep">·</span>
							<span>{mcpName(detail.startedBy, detail.viaMcp)}</span>
						{/if}
						<span class="meta-sep">·</span>
						<span>{new Date(detail.createdAt).toLocaleString()}</span>
						<span class="meta-sep">·</span>
						<span class="browser-pill">
							<BrowserIcon browser={detail.browser ?? BROWSERS[0].id} />
							{detail.browser ?? BROWSERS[0].id}
						</span>
					</div>
				</div>
			</div>

			<div class="header-stats">
				<div class="stat">
					<span class="stat-num pass-color">{passed}</span>
					<span class="stat-label">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						{STAT_PASSED}
					</span>
				</div>
				{#if failed > 0}
					<div class="stat">
						<span class="stat-num fail-color">{failed}</span>
						<span class="stat-label">
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
							</svg>
							{STAT_FAILED}
						</span>
					</div>
				{/if}
				{#if skipped > 0}
					<div class="stat">
						<span class="stat-num muted-color">{skipped}</span>
						<span class="stat-label">
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
							>
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							{STAT_SKIPPED}
						</span>
					</div>
				{/if}
				<div class="stat">
					<span class="stat-num">{fmtDuration(totalDuration)}</span>
					<span class="stat-label">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
						</svg>
						{STAT_DURATION}
					</span>
				</div>
				<div class="stat">
					<span class="stat-num">{detail.runnerCount}</span>
					<span class="stat-label">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						>
							<rect x="2" y="3" width="20" height="14" rx="2" />
							<path d="M8 21h8M12 17v4" />
						</svg>
						{pluralize(detail.runnerCount, 'runner')}
					</span>
				</div>
				{#if detail.workerCount > 1}
					<div class="stat">
						<span class="stat-num">{detail.workerCount}</span>
						<span class="stat-label">
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="3" y="3" width="7" height="7" rx="1" />
								<rect x="14" y="3" width="7" height="7" rx="1" />
								<rect x="3" y="14" width="7" height="7" rx="1" />
								<rect x="14" y="14" width="7" height="7" rx="1" />
							</svg>
							{pluralize(detail.workerCount, 'worker')}
						</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if logSections.length > 0}
		<details class="logs-section">
			<summary class="logs-summary">
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
				</svg>
				{RUN_LOGS_LABEL}
				{#if logSections.length > 1}
					<span class="log-runner-count">{runnersBadge(logSections.length)}</span>
				{/if}
			</summary>

			{#if logSections.length > 1}
				<div class="log-tabs">
					{#each logSections as section, i}
						<button
							class="log-tab"
							class:log-tab-active={activeLogTab === i}
							on:click|stopPropagation={() => (activeLogTab = i)}
						>
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							>
								<rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
							</svg>
							{section.name}
						</button>
					{/each}
				</div>
			{/if}

			<pre class="logs-body">{logSections[activeLogTab]?.content ?? ''}</pre>
		</details>
	{/if}

	{#each runnerGroups as runnerGroup, ri}
		{#if runnerGroups.length > 1}
			<div class="group-header runner-group-header">
				<svg
					class="group-icon"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				>
					<rect x="2" y="3" width="20" height="14" rx="2" />
					<path d="M8 21h8M12 17v4" />
				</svg>
				{runnerGroup.runnerName ?? UNKNOWN_RUNNER_LABEL}
			</div>
		{/if}
		{#each runnerGroup.workers as workerGroup, wi}
			{#if runnerGroup.workers.length > 1}
				<div class="group-header worker-group-header">
					<svg
						class="group-icon"
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
						<rect x="14" y="14" width="7" height="7" rx="1" />
					</svg>
					{workerLabel(workerGroup.workerId)}
				</div>
			{/if}
			{#each workerGroup.features as feature, fi}
				<div
					class="feature"
					class:feature-pass={feature.status === 'passed'}
					class:feature-fail={feature.status !== 'passed'}
					style={stagger(fi, 60)}
				>
					<div class="feature-header">
						<h2 class="feature-name">
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="feature-icon"
							>
								<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
								<polyline points="14 2 14 8 20 8" />
							</svg>
							{feature.name}
							{#if featureSuiteTag(feature)}
								<span class="suite-tag">{featureSuiteTag(feature)}</span>
							{/if}
						</h2>
						<div class="feature-right">
							<span class="feature-file" title={feature.uri}>{featureFile(feature.uri)}</span>
							<Badge variant={feature.status === 'passed' ? 'pass' : 'fail'}>
								{feature.status}
							</Badge>
						</div>
					</div>

					<div class="scenarios">
						{#each feature.scenarioGroups as group, si}
							{@const scenId = `${ri}-${wi}-${fi}-${group.key}`}
							{@const open = expandedScenarios.has(scenId)}
							{@const groupHasReplay = group.scenarios.some(scenarioHasRecording)}
							<div
								class="scenario"
								class:scenario-fail={group.status === 'failed'}
								style={stagger(fi * 5 + si, 40)}
							>
								<div class="scenario-row">
									<button class="scenario-header" on:click={() => toggleScenario(scenId)}>
										<StatusDot status={group.status} />

										<span class="scenario-name">
											{group.name}
											{#if group.scenarios.length > 1}
												<span class="scenario-count">{casesCountLabel(group.scenarios.length)}</span
												>
											{/if}
											{#if group.scenarios[0]?.attempts > 1}
												<span class="scenario-count" title={RETRY_TITLE}>
													{attemptsLabel(group.scenarios[0].attempts)}
												</span>
											{/if}
										</span>

										<div class="scenario-tags">
											{#each group.tags as tag}
												<TagChip {tag} />
											{/each}
										</div>

										<span class="scenario-duration">{fmtDuration(group.duration)}</span>

										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											class="chevron"
											class:rotated={open}
										>
											<polyline points="9 18 15 12 9 6" />
										</svg>
									</button>

									{#if groupHasReplay && group.scenarios.length === 1}
										<button
											class="replay-btn"
											title={WATCH_REPLAY_TITLE}
											on:click={() => openReplay(group.scenarios[0])}
										>
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="currentColor"
												stroke="none"
											>
												<polygon points="5,3 19,12 5,21" />
											</svg>
											{REPLAY_LABEL}
										</button>
									{/if}
								</div>

								{#if open}
									<div class="steps" transition:slide={{ duration: 200 }}>
										{#each group.scenarios as scenario, exampleIndex}
											{#if group.scenarios.length > 1}
												<div class="example-header">
													<StatusDot status={scenario.status} />
													<span>{caseLabel(exampleIndex + 1)}</span>
													<span class="scenario-duration">{fmtDuration(scenario.duration)}</span>
													{#if scenarioHasRecording(scenario)}
														<button
															class="replay-btn replay-btn-sm"
															on:click={() => openReplay(scenario)}
														>
															<svg
																width="9"
																height="9"
																viewBox="0 0 24 24"
																fill="currentColor"
																stroke="none"
															>
																<polygon points="5,3 19,12 5,21" />
															</svg>
															{REPLAY_LABEL}
														</button>
													{/if}
												</div>
											{/if}

											{#each scenario.steps as step}
												<div
													class="step"
													class:step-fail={step.status === 'failed'}
													class:step-skip={step.status === 'skipped' || step.status === 'pending'}
												>
													<div class="step-row">
														<StepStatusIcon status={step.status} />
														<StepKeyword keyword={step.keyword} />
														<span class="step-name">{step.name}</span>
														<span class="step-duration">{fmtDuration(step.duration)}</span>
													</div>

													{#if step.error}
														<pre class="step-error">{step.error}</pre>
													{/if}

													{#if step.dataTable}
														<table class="step-datatable">
															<tbody>
																{#each step.dataTable as row, ri}
																	<tr class:step-datatable-header={ri === 0}>
																		{#each row as cell}
																			<td>{cell}</td>
																		{/each}
																	</tr>
																{/each}
															</tbody>
														</table>
													{/if}
												</div>
											{/each}
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/each}
	{/each}
{/if}

{#if replayOpen && replayScenario}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div class="replay-overlay" on:click={closeReplay}>
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="replay-modal" on:click|stopPropagation>
			<div class="replay-modal-header">
				<div class="replay-modal-heading">
					<span class="replay-modal-title">{replayScenario.name}</span>
					{#each visibleTags(replayScenario) as tag}
						<TagChip {tag} />
					{/each}
				</div>
				<button class="replay-close" on:click={closeReplay}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div class="replay-body">
				{#if scenarioRecordings.length > 0}
					<RecordingPlayer
						{reportId}
						recordings={scenarioRecordings}
						steps={replayScenario.steps}
						bind:inspecting={replayInspecting}
					/>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.detail-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.report-header {
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		border-top-width: 3px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		background: var(--bg-elevated);
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.report-header.pass {
		border-top-color: var(--pass);
	}
	.report-header.fail {
		border-top-color: var(--fail);
	}

	.header-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.header-status {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.status-icon-wrap {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.status-icon-wrap.pass-bg {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.status-icon-wrap.fail-bg {
		background: var(--fail-soft);
		color: var(--fail);
	}

	.h1-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.2rem;
	}

	.run-name-badge {
		display: inline-flex;
		align-items: center;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: var(--radius-pill);
		padding: 0.25rem 0.7rem;
		white-space: nowrap;
		max-width: 240px;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 3px;
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 0;
	}

	.header-meta {
		font-size: 0.8125rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.meta-sep {
		opacity: 0.4;
	}

	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
	}

	.browser-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 500;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.45rem;
	}

	.header-stats {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		flex-shrink: 0;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.stat-num {
		font-family: var(--font-display);
		font-size: 1.75rem;
		line-height: 1;
		font-weight: 400;
		color: var(--text);
	}

	.stat-label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.68rem;
		color: var(--text-muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.pass-color {
		color: var(--pass);
	}
	.fail-color {
		color: var(--fail);
	}
	.muted-color {
		color: var(--text-muted);
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.4rem;
		margin-top: 1.75rem;
		margin-bottom: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--border);
	}
	.group-header:first-child {
		margin-top: 0;
	}
	.group-icon {
		flex-shrink: 0;
		opacity: 0.7;
	}
	.runner-group-header {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
	}
	.worker-group-header {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-muted);
	}

	.feature {
		margin-bottom: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-top-width: 3px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.feature-pass {
		border-top-color: var(--pass);
	}
	.feature-fail {
		border-top-color: var(--fail);
	}

	.feature-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
	}

	.feature-icon {
		flex-shrink: 0;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.feature-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-family: var(--font-display);
		font-weight: 400;
		flex: 1;
		min-width: 0;
	}

	.feature-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.feature-file {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.suite-tag {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		background: var(--accent-soft);
		color: var(--accent);
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-pill);
		font-weight: 500;
	}

	.scenarios {
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.25rem;
	}

	.scenario {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		overflow: hidden;
		animation: fadeUp 0.3s var(--ease-out) both;
	}

	.scenario.scenario-fail {
		border-left-width: 3px;
		border-left-color: var(--fail);
	}

	.scenario-row {
		display: flex;
		align-items: stretch;
	}

	.scenario-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-body);
		transition: background var(--duration-fast);
	}

	.scenario-header:hover {
		background: var(--bg-subtle);
	}

	.replay-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0 0.875rem;
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--accent);
		background: transparent;
		border: none;
		border-left: 1px solid var(--border);
		cursor: pointer;
		flex-shrink: 0;
		transition: background var(--duration-fast);
		white-space: nowrap;
	}

	.replay-btn:hover {
		background: var(--accent-soft);
	}

	.replay-btn-sm {
		margin-left: auto;
		padding: 0.15rem 0.5rem;
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: var(--radius-sm);
		font-size: 0.68rem;
	}

	.scenario-name {
		flex: 1;
		font-size: 0.875rem;
		color: var(--text);
		font-weight: 400;
		text-align: left;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.scenario-count {
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.05rem 0.4rem;
		white-space: nowrap;
	}

	.scenario-tags {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.scenario-duration {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		flex-shrink: 0;
	}

	.chevron {
		color: var(--text-muted);
		flex-shrink: 0;
		transition: transform var(--duration-fast) var(--ease-out);
	}

	.chevron.rotated {
		transform: rotate(90deg);
	}

	.steps {
		border-top: 1px solid var(--border);
		background: var(--bg-subtle);
		padding: 0.5rem 0;
	}

	.example-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem 0.25rem 1.25rem;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.example-header:not(:first-child) {
		margin-top: 0.375rem;
		border-top: 1px dashed var(--border);
	}

	.example-header .scenario-duration {
		margin-left: auto;
	}

	.step {
		padding: 0.375rem 1rem 0.375rem 1.25rem;
	}
	.step-fail {
		background: color-mix(in srgb, var(--fail-soft) 40%, transparent);
	}
	.step-skip {
		opacity: 0.5;
	}

	.step-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.step-name {
		flex: 1;
		font-size: 0.8125rem;
		color: var(--text);
		font-family: 'JetBrains Mono', monospace;
	}

	.step-duration {
		font-size: 0.7rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		flex-shrink: 0;
	}

	.step-error {
		margin: 0.375rem 0 0.25rem 1.75rem;
		padding: 0.625rem 0.875rem;
		background: var(--fail-soft);
		color: var(--fail);
		border-radius: var(--radius-sm);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		border-left: 2px solid var(--fail);
	}

	.step-datatable {
		margin: 0.375rem 0 0.25rem 1.75rem;
		border-collapse: collapse;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
	}

	.step-datatable td {
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--border);
		color: var(--text);
	}

	.step-datatable-header td {
		background: var(--bg-subtle);
		color: var(--text-muted);
		font-weight: 600;
	}

	.loading-state {
		display: flex;
		justify-content: center;
		padding: 4rem 0;
	}

	.loading-dots {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.loading-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		animation: dotBeat 1.2s ease-in-out infinite;
	}

	.loading-dots span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.loading-dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes dotBeat {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.3;
			transform: scale(0.6);
		}
	}

	.error-state {
		padding: 3rem 0;
		color: var(--fail);
		text-align: center;
		font-size: 0.9375rem;
	}

	/* ── Run Logs ── */
	.logs-section {
		margin-bottom: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.logs-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1.25rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		cursor: pointer;
		user-select: none;
		list-style: none;
	}

	.logs-summary::-webkit-details-marker {
		display: none;
	}

	.logs-summary:hover {
		background: var(--bg-subtle);
	}

	.log-runner-count {
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.5rem;
	}

	.log-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
		overflow-x: auto;
	}

	.log-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		font-size: 0.78rem;
		font-weight: 500;
		font-family: var(--font-body);
		color: var(--text-muted);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		transition: color var(--duration-fast);
	}

	.log-tab:hover {
		color: var(--text);
	}

	.log-tab-active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	.logs-body {
		font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
		font-size: 0.775rem;
		line-height: 1.7;
		background: var(--terminal-bg);
		color: var(--terminal-text);
		padding: 1rem 1.25rem;
		max-height: 480px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		border-top: 1px solid var(--border);
	}

	.logs-body::-webkit-scrollbar {
		width: 4px;
	}
	.logs-body::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}

	/* ── Replay modal ── */
	.replay-overlay {
		position: fixed;
		inset: 0;
		background: var(--bg-elevated);
		display: flex;
		z-index: 500;
	}

	.replay-modal {
		background: var(--bg-elevated);
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden auto;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
	}

	.replay-modal-header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.875rem 3rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.replay-modal-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.replay-modal-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.replay-close {
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition: color var(--duration-fast);
	}

	.replay-close:hover {
		color: var(--text);
	}

	.replay-body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
</style>
