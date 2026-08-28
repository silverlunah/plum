<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { fetchReports, deleteReport, deleteReports, reportUrl } from '$lib/api/reports';
	import { reportsVersion } from '$lib/stores/runner';
	import { REPORTS_PER_PAGE, BROWSERS } from '$lib/constants';
	import { isScheduled, triggerLabel, triggerVariant, stagger } from '$lib/utils/format';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import {
		LIST_PAGE_TITLE,
		HEADING,
		PASSING_LABEL,
		RECENT_LABEL,
		TREND_HINT,
		NO_REPORTS_MESSAGE,
		SELECT_ALL_TITLE,
		SELECT_ROW_TITLE,
		DELETE_REPORT_TITLE,
		LEGACY_SCREENSHOTS_NOTICE,
		DISMISS_NOTICE_TITLE,
		deleteReportsTitle,
		deleteReportsBody,
		runsRecorded,
		passedCountLabel,
		failedCountLabel,
		trendDotTitle,
		deleteSelectedLabel
	} from '$lib/copy/reports';

	let reports = [];
	let total = 0;
	let passCount = 0;
	let failCount = 0;
	let trend = [];
	let currentPage = 1;
	let animateBar = false;

	let selected = new Set();
	let deleteModal = { open: false, targets: [] };
	let deleting = false;
	let showLegacyNotice = false;

	$: totalPages = Math.ceil(total / REPORTS_PER_PAGE);
	$: passRate = total ? Math.round((passCount / total) * 100) : 0;
	$: trendDots = [...trend].reverse();
	$: allOnPageSelected = reports.length > 0 && reports.every((r) => selected.has(r.id));
	$: someSelected = selected.size > 0;

	async function loadReports() {
		try {
			let data = await fetchReports({ page: currentPage, limit: REPORTS_PER_PAGE });
			if (data.reports.length === 0 && currentPage > 1) {
				currentPage = Math.max(1, Math.ceil(data.total / REPORTS_PER_PAGE));
				data = await fetchReports({ page: currentPage, limit: REPORTS_PER_PAGE });
			}
			reports = data.reports;
			total = data.total;
			passCount = data.passCount;
			failCount = data.failCount;
			trend = data.trend;
			selected = new Set();
			await tick();
			animateBar = true;
		} catch (e) {
			console.error('Failed to fetch reports', e);
		}
	}

	function goToPage(page) {
		currentPage = page;
		loadReports();
	}

	onMount(() => {
		loadReports();
		try {
			showLegacyNotice = localStorage.getItem('plum:legacyScreenshotsNoticeDismissed') !== 'true';
		} catch {
			showLegacyNotice = true;
		}
	});
	$: if ($reportsVersion) loadReports();

	function dismissLegacyNotice() {
		showLegacyNotice = false;
		try {
			localStorage.setItem('plum:legacyScreenshotsNoticeDismissed', 'true');
		} catch {}
	}

	function toggleSelect(id, e) {
		e.preventDefault();
		e.stopPropagation();
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function toggleAll(e) {
		e.stopPropagation();
		if (allOnPageSelected) {
			const next = new Set(selected);
			reports.forEach((r) => next.delete(r.id));
			selected = next;
		} else {
			const next = new Set(selected);
			reports.forEach((r) => next.add(r.id));
			selected = next;
		}
	}

	function openDeleteModal(targets) {
		deleteModal = { open: true, targets };
	}

	function openSingleDelete(id, e) {
		e.preventDefault();
		e.stopPropagation();
		openDeleteModal([id]);
	}

	async function confirmDelete() {
		deleting = true;
		try {
			if (deleteModal.targets.length === 1) {
				await deleteReport(deleteModal.targets[0]);
			} else {
				await deleteReports([...deleteModal.targets]);
			}
			deleteModal = { open: false, targets: [] };
			await loadReports();
		} catch (e) {
			console.error('Delete failed', e);
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{LIST_PAGE_TITLE}</title></svelte:head>

<ConfirmModal
	bind:open={deleteModal.open}
	title={deleteReportsTitle(deleteModal.targets.length)}
	loading={deleting}
	on:confirm={confirmDelete}
>
	{deleteReportsBody(deleteModal.targets.length)}
</ConfirmModal>

{#if showLegacyNotice}
	<div class="legacy-notice" transition:slide={{ duration: 200 }}>
		<p>{LEGACY_SCREENSHOTS_NOTICE}</p>
		<button
			class="legacy-notice-dismiss"
			title={DISMISS_NOTICE_TITLE}
			aria-label={DISMISS_NOTICE_TITLE}
			on:click={dismissLegacyNotice}
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
			>
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>
{/if}

<div class="page-header">
	<div class="header-top">
		<div>
			<h1>{HEADING}</h1>
			<p class="subtitle">
				{runsRecorded(total)}
			</p>
		</div>

		{#if total > 0}
			<div class="rate-display">
				<span
					class="rate-number"
					class:pass={passRate >= 80}
					class:warn={passRate < 80 && passRate >= 50}
					class:fail={passRate < 50}
				>
					{passRate}%
				</span>
				<span class="rate-label">{PASSING_LABEL}</span>
			</div>
		{/if}
	</div>

	{#if total > 0}
		<div class="stats-bar">
			<div class="pass-bar-track">
				<div class="pass-bar-fill" style="width: {animateBar ? passRate + '%' : '0'}"></div>
			</div>
			<div class="bar-legend">
				<span class="legend-pass">{passedCountLabel(passCount)}</span>
				<span class="legend-fail">{failedCountLabel(failCount)}</span>
			</div>
		</div>

		<div class="trend-row">
			<span class="trend-label">{RECENT_LABEL}</span>
			<div class="trend-dots">
				{#each trendDots as r, i}
					<span
						class="trend-dot"
						class:pass={r.status === 'PASS'}
						class:fail={r.status !== 'PASS'}
						style={stagger(i, 35)}
						title={trendDotTitle(r.status, r.tags, r.date)}
					></span>
				{/each}
			</div>
			<span class="trend-hint">{TREND_HINT}</span>
		</div>
	{/if}
</div>

{#if total === 0}
	<EmptyState message={NO_REPORTS_MESSAGE} />
{:else}
	<div class="list-header">
		<label class="select-all-wrap" title={SELECT_ALL_TITLE}>
			<input
				type="checkbox"
				class="checkbox"
				checked={allOnPageSelected}
				indeterminate={someSelected && !allOnPageSelected}
				on:change={toggleAll}
			/>
		</label>
		{#if someSelected}
			<button class="btn-delete-selected" on:click={() => openDeleteModal([...selected])}>
				{deleteSelectedLabel(selected.size)}
			</button>
		{/if}
	</div>

	<div class="report-list">
		{#each reports as report, i}
			<div class="report-row" class:is-selected={selected.has(report.id)} style={stagger(i)}>
				<label class="row-check-wrap" title={SELECT_ROW_TITLE}>
					<input
						type="checkbox"
						class="checkbox"
						checked={selected.has(report.id)}
						on:change={(e) => toggleSelect(report.id, e)}
					/>
				</label>

				<a
					class="report-item"
					class:is-pass={report.status === 'PASS'}
					class:is-fail={report.status !== 'PASS'}
					href={reportUrl(report.id)}
				>
					<div class="item-left">
						<span
							class="status-mark"
							class:pass={report.status === 'PASS'}
							class:fail={report.status !== 'PASS'}
						>
							{report.status === 'PASS' ? '✓' : '✗'}
						</span>
						<div class="item-meta">
							<span class="item-tags">
								{report.testRun?.title ??
									(isScheduled(report.triggerType) ? report.triggerType : report.tags)}
							</span>
							<div class="item-badges">
								<Badge variant={triggerVariant(report.triggerType)}>
									{triggerLabel(report.triggerType)}
								</Badge>
								{#if report.browser && report.browser !== BROWSERS[0].id}
									<Badge variant="neutral">{report.browser}</Badge>
								{/if}
							</div>
						</div>
					</div>
					<div class="item-right">
						<span class="item-date">{report.date}</span>
						<svg
							class="item-arrow"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						>
							<line x1="5" y1="12" x2="19" y2="12" />
							<polyline points="12 5 19 12 12 19" />
						</svg>
					</div>
				</a>

				<button
					class="row-delete-btn"
					title={DELETE_REPORT_TITLE}
					on:click={(e) => openSingleDelete(report.id, e)}
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
					>
						<polyline points="3 6 5 6 21 6" />
						<path d="M19 6l-1 14H6L5 6" />
						<path d="M10 11v6M14 11v6" />
						<path d="M9 6V4h6v2" />
					</svg>
				</button>
			</div>
		{/each}
	</div>

	{#if totalPages > 1}
		<div class="pagination-wrap">
			<Pagination current={currentPage} total={totalPages} on:change={(e) => goToPage(e.detail)} />
		</div>
	{/if}
{/if}

<style>
	.legacy-notice {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: var(--radius-sm);
		padding: 0.75rem 0.875rem;
		margin-bottom: 1.5rem;
	}
	.legacy-notice p {
		flex: 1;
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
	}
	.legacy-notice-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.125rem;
		border-radius: var(--radius-sm);
		transition: color var(--duration-fast);
	}
	.legacy-notice-dismiss:hover {
		color: var(--text);
	}

	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.header-top {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	/* ── Pass rate ── */
	.rate-display {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.1rem;
	}

	.rate-number {
		font-family: var(--font-display);
		font-size: 2.75rem;
		line-height: 1;
		font-weight: 400;
	}

	.rate-number.pass {
		color: var(--pass);
	}
	.rate-number.warn {
		color: var(--warn);
	}
	.rate-number.fail {
		color: var(--fail);
	}

	.rate-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	/* ── Stats bar ── */
	.stats-bar {
		margin-bottom: 1rem;
	}

	.pass-bar-track {
		height: 3px;
		background: var(--fail-soft);
		border-radius: var(--radius-pill);
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.pass-bar-fill {
		height: 100%;
		background: var(--pass);
		border-radius: var(--radius-pill);
		transition: width 0.9s var(--ease-out) 0.1s;
	}

	.bar-legend {
		display: flex;
		gap: 1rem;
	}

	.legend-pass {
		font-size: 0.75rem;
		color: var(--pass);
		font-weight: 500;
	}
	.legend-fail {
		font-size: 0.75rem;
		color: var(--fail);
		font-weight: 500;
	}

	/* ── Trend ── */
	.trend-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.trend-label {
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.trend-dots {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.trend-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		transition: transform var(--duration-fast);
		animation: fadeUp 0.3s var(--ease-out) both;
	}

	.trend-dot:hover {
		transform: scale(1.4);
	}
	.trend-dot.pass {
		background: var(--pass);
	}
	.trend-dot.fail {
		background: var(--fail);
	}

	.trend-hint {
		font-size: 0.68rem;
		color: var(--text-muted);
		opacity: 0.6;
	}

	/* ── Select-all row ── */
	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.5rem 0.375rem;
	}

	.select-all-wrap {
		display: flex;
		align-items: center;
		cursor: pointer;
		padding: 0.25rem;
	}

	.btn-delete-selected {
		height: 30px;
		padding: 0 0.75rem;
		font-size: 0.78rem;
		font-family: inherit;
		font-weight: 500;
		color: var(--fail);
		background: var(--fail-soft, rgba(239, 68, 68, 0.08));
		border: 1px solid var(--fail);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			opacity var(--duration-fast);
	}

	.btn-delete-selected:hover {
		background: var(--fail);
		color: var(--white);
	}

	/* ── Report rows ── */
	.report-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.report-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		animation: fadeUp 0.32s var(--ease-out) both;
	}

	.row-check-wrap {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		cursor: pointer;
		padding: 0.25rem;
	}

	.checkbox {
		width: 15px;
		height: 15px;
		accent-color: var(--accent, #7c3aed);
		cursor: pointer;
	}

	.report-item {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		text-decoration: none;
		color: inherit;
		border-left-width: 3px;
		transition:
			background var(--duration-fast),
			transform var(--duration-fast) var(--ease-out),
			box-shadow var(--duration-fast);
		min-width: 0;
	}

	.report-item:hover {
		background: var(--bg-subtle);
		transform: translateX(2px);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
	}

	.report-item.is-pass {
		border-left-color: var(--pass);
	}
	.report-item.is-fail {
		border-left-color: var(--fail);
	}

	.report-row.is-selected .report-item {
		background: var(--bg-subtle);
		border-color: var(--accent, #7c3aed);
	}

	.item-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
	}

	.status-mark {
		font-size: 0.875rem;
		font-weight: 600;
		flex-shrink: 0;
		width: 20px;
		text-align: center;
	}

	.status-mark.pass {
		color: var(--pass);
	}
	.status-mark.fail {
		color: var(--fail);
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-width: 0;
	}

	.item-tags {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.item-badges {
		flex-shrink: 0;
	}

	.item-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.item-date {
		font-size: 0.8rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.item-arrow {
		color: var(--text-muted);
		transition:
			transform var(--duration-fast) var(--ease-out),
			color var(--duration-fast);
	}

	.report-item:hover .item-arrow {
		transform: translateX(3px);
		color: var(--text);
	}

	/* ── Per-row delete button ── */
	.row-delete-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--duration-fast),
			color var(--duration-fast),
			background var(--duration-fast);
	}

	.report-row:hover .row-delete-btn {
		opacity: 1;
	}

	.row-delete-btn:hover {
		color: var(--fail);
		background: var(--fail-soft, rgba(239, 68, 68, 0.08));
	}

	/* ── Misc ── */
	.pagination-wrap {
		margin-top: 1.25rem;
	}
</style>
