<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onDestroy, onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { get } from 'svelte/store';
	import {
		fetchReportAnalysis,
		startReportAnalysis,
		startReportAnalysisFix
	} from '$lib/api/reports';
	import { runnerConfig } from '$lib/stores/runner';
	import { notify } from '$lib/stores/notifications';
	import { ANALYSIS_POLL_MS, ANALYSIS_STATUS, ANALYSIS_VERDICT } from '$lib/constants';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import {
		CARD_TITLE,
		CARD_IDLE_HINT,
		START_MODAL_TITLE,
		START_MODAL_BODY,
		START_CONFIRM_LABEL,
		ANALYZING_LABEL,
		ANALYZING_HINT,
		FIXING_LABEL,
		FIXING_HINT,
		VERDICT_LABEL,
		VERDICT_HEADLINE,
		BADGE_VARIANT,
		FINDINGS_LABEL,
		RECOMMENDATION_LABEL,
		EVIDENCE_LABEL,
		FIX_LABEL,
		FIX_MODAL_TITLE,
		FIX_MODAL_BODY,
		FIX_CONFIRM_LABEL,
		VIEW_PR_LABEL,
		REANALYZE_LABEL,
		REANALYZE_TITLE,
		ANALYSIS_FAILED,
		attemptLabel,
		analyzedByLabel
	} from '$lib/copy/aiAnalysis';

	export let reportId;

	const IN_FLIGHT = [ANALYSIS_STATUS.ANALYZING, ANALYSIS_STATUS.FIXING];

	let analysis = null;
	let expanded = false;
	let starting = false;
	let confirmStart = false;
	let confirmFix = false;
	let poll;

	$: busy = !!analysis && IN_FLIGHT.includes(analysis.status);
	$: verdict = analysis?.verdict || ANALYSIS_VERDICT.UNKNOWN;
	$: settled =
		analysis?.status === ANALYSIS_STATUS.DONE || analysis?.status === ANALYSIS_STATUS.FIXED;
	$: findings = Array.isArray(analysis?.findings) ? analysis.findings : [];

	// An investigation runs detached on the server, with no socket of its own.
	function schedule() {
		clearTimeout(poll);
		if (analysis && IN_FLIGHT.includes(analysis.status)) {
			poll = setTimeout(refresh, ANALYSIS_POLL_MS);
		}
	}

	async function refresh() {
		try {
			analysis = await fetchReportAnalysis(reportId);
		} catch {
			// A dropped poll is not worth a toast, the next one recovers.
		}
		schedule();
	}

	onMount(() => {
		refresh();
	});
	onDestroy(() => clearTimeout(poll));

	async function run() {
		starting = true;
		try {
			analysis = await startReportAnalysis(reportId, get(runnerConfig).selectedRunners);
			confirmStart = false;
			expanded = true;
			schedule();
		} catch (e) {
			notify('error', e.message || ANALYSIS_FAILED);
		} finally {
			starting = false;
		}
	}

	async function fix() {
		starting = true;
		try {
			analysis = await startReportAnalysisFix(reportId, analysis.id);
			confirmFix = false;
			schedule();
		} catch (e) {
			notify('error', e.message || ANALYSIS_FAILED);
		} finally {
			starting = false;
		}
	}

	function toggle() {
		if (!analysis) confirmStart = true;
		else expanded = !expanded;
	}
</script>

<div class="analysis-card">
	<button class="analysis-header" on:click={toggle} aria-expanded={expanded}>
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="sparkle"
		>
			<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
			<path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
		</svg>
		<span class="analysis-title">{CARD_TITLE}</span>

		{#if busy}
			<span class="analysis-status">
				<span class="spinner" aria-hidden="true"></span>
				{analysis.status === ANALYSIS_STATUS.FIXING ? FIXING_LABEL : ANALYZING_LABEL}
			</span>
		{:else if settled}
			<span class="analysis-status">
				<Badge variant={BADGE_VARIANT[verdict]}>{VERDICT_LABEL[verdict]}</Badge>
			</span>
		{:else if analysis?.status === ANALYSIS_STATUS.ERROR}
			<span class="analysis-status analysis-status-error">{analysis.error}</span>
		{:else}
			<span class="analysis-status analysis-hint">{CARD_IDLE_HINT}</span>
		{/if}

		{#if analysis}
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				class="chevron"
				class:rotated={expanded}
			>
				<polyline points="9 18 15 12 9 6" />
			</svg>
		{/if}
	</button>

	{#if analysis && expanded}
		<div class="analysis-body" transition:slide={{ duration: 200 }}>
			{#if busy}
				<div class="thinking">
					<span class="spinner spinner-lg" aria-hidden="true"></span>
					<p>{analysis.status === ANALYSIS_STATUS.FIXING ? FIXING_HINT : ANALYZING_HINT}</p>
				</div>
			{:else}
				{#if settled}
					<p class="headline">{VERDICT_HEADLINE[verdict]}</p>
					{#if analysis.summary}
						<p class="summary">{analysis.summary}</p>
					{/if}

					{#if findings.length > 0}
						<h4 class="section-label">{FINDINGS_LABEL}</h4>
						<ul class="findings">
							{#each findings as finding}
								<li>
									<span class="finding-scenario">{finding.scenario}</span>
									<span class="finding-cause">{finding.cause}</span>
									{#if finding.evidence}
										<span class="finding-evidence">{EVIDENCE_LABEL}: {finding.evidence}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if analysis.recommendation}
						<h4 class="section-label">{RECOMMENDATION_LABEL}</h4>
						<p class="summary">{analysis.recommendation}</p>
					{/if}
				{/if}

				{#if analysis.error}
					<p class="error-note">{analysis.error}</p>
				{/if}

				<div class="analysis-actions">
					{#if analysis.prUrl}
						<a class="btn-primary" href={analysis.prUrl} target="_blank" rel="noreferrer noopener">
							{VIEW_PR_LABEL}
						</a>
					{:else if analysis.status === ANALYSIS_STATUS.DONE && verdict === ANALYSIS_VERDICT.TEST_CODE}
						<button class="btn-primary" on:click={() => (confirmFix = true)} disabled={starting}>
							{FIX_LABEL}
						</button>
					{/if}
					<button class="btn-ghost" title={REANALYZE_TITLE} on:click={run} disabled={starting}>
						{REANALYZE_LABEL}
					</button>
				</div>

				<p class="analysis-meta">
					{attemptLabel(analysis.attempt)} · {analyzedByLabel(
						analysis.createdBy?.name,
						analysis.createdAt
					)}
				</p>
			{/if}
		</div>
	{/if}
</div>

<ConfirmModal
	bind:open={confirmStart}
	title={START_MODAL_TITLE}
	confirmLabel={START_CONFIRM_LABEL}
	variant="primary"
	loading={starting}
	on:confirm={run}
>
	{START_MODAL_BODY}
</ConfirmModal>

<ConfirmModal
	bind:open={confirmFix}
	title={FIX_MODAL_TITLE}
	confirmLabel={FIX_CONFIRM_LABEL}
	variant="primary"
	loading={starting}
	on:confirm={fix}
>
	{FIX_MODAL_BODY}
</ConfirmModal>

<style>
	.analysis-card {
		margin-bottom: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.analysis-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.875rem 1.25rem;
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		text-align: left;
		color: var(--text);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background var(--duration-fast);
	}

	.analysis-header:hover {
		background: var(--bg-subtle);
	}

	.sparkle {
		flex-shrink: 0;
		color: var(--accent);
	}

	.analysis-title {
		flex-shrink: 0;
	}

	.analysis-status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-left: auto;
		font-size: 0.78rem;
		font-weight: 400;
		color: var(--text-muted);
		min-width: 0;
	}

	.analysis-hint,
	.analysis-status-error {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.analysis-status-error {
		color: var(--fail);
	}

	.chevron {
		flex-shrink: 0;
		color: var(--text-muted);
		transition: transform var(--duration-fast) var(--ease-out);
	}

	.chevron.rotated {
		transform: rotate(90deg);
	}

	.spinner {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		border: 1.5px solid var(--accent-soft);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.spinner-lg {
		width: 20px;
		height: 20px;
		border-width: 2px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.analysis-body {
		padding: 0 1.25rem 1.25rem;
		border-top: 1px solid var(--border);
	}

	.thinking {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-top: 1.25rem;
	}

	.thinking p {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--text-muted);
	}

	.headline {
		padding-top: 1.25rem;
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--text);
	}

	.summary {
		margin-top: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.7;
		color: var(--text-muted);
		white-space: pre-wrap;
	}

	.section-label {
		margin-top: 1.25rem;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.findings {
		margin-top: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		list-style: none;
	}

	.findings li {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.625rem 0.875rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.finding-scenario {
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--text);
	}

	.finding-cause {
		font-size: 0.82rem;
		line-height: 1.6;
		color: var(--text-muted);
	}

	.finding-evidence {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--text-muted);
		opacity: 0.85;
	}

	.error-note {
		margin-top: 1rem;
		padding: 0.625rem 0.875rem;
		font-size: 0.82rem;
		line-height: 1.6;
		color: var(--fail);
		background: var(--fail-soft);
		border-radius: var(--radius-md);
	}

	.analysis-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	.btn-primary,
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		height: 32px;
		padding: 0 0.875rem;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-decoration: none;
		transition:
			opacity var(--duration-fast),
			background var(--duration-fast);
	}

	.btn-primary {
		color: var(--white);
		background: var(--accent);
		border: 1px solid var(--accent);
	}

	.btn-ghost {
		color: var(--text);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
	}

	.btn-ghost:hover:not(:disabled) {
		background: var(--bg-subtle);
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn-primary:disabled,
	.btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.analysis-meta {
		margin-top: 0.875rem;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	@media (max-width: 640px) {
		.analysis-hint {
			display: none;
		}
	}
</style>
