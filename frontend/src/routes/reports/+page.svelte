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
	import { onMount, tick } from 'svelte';
	import { fetchReports, deleteReport, deleteReports } from '$lib/api/reports';
	import { reportsVersion } from '$lib/stores/runner';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	let reports = [];
	let currentPage = 1;
	const PER_PAGE = 15;
	let animateBar = false;

	let selected = new Set();
	let deleteModal = { open: false, targets: [] };
	let deleting = false;

	$: totalPages = Math.ceil(reports.length / PER_PAGE);
	$: paginated = reports.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
	$: passCount = reports.filter((r) => r.status === 'PASS').length;
	$: failCount = reports.length - passCount;
	$: passRate = reports.length ? Math.round((passCount / reports.length) * 100) : 0;
	$: trend = reports.slice(0, 12).reverse();
	$: allOnPageSelected = paginated.length > 0 && paginated.every((r) => selected.has(r.fileName));
	$: someSelected = selected.size > 0;

	function triggerLabel(type) {
		if (type === 'manual-trigger') return 'Manual';
		if (type === 'command-line-trigger' || type === 'undefined') return 'CLI';
		return 'Scheduled';
	}

	function triggerVariant(type) {
		if (type === 'manual-trigger') return 'tag';
		if (type === 'command-line-trigger' || type === 'undefined') return 'neutral';
		return 'schedule';
	}

	async function loadReports() {
		try {
			reports = await fetchReports();
			selected = new Set();
			await tick();
			animateBar = true;
		} catch (e) {
			console.error('Failed to fetch reports', e);
		}
	}

	onMount(loadReports);
	$: if ($reportsVersion) loadReports();

	function toggleSelect(fileName, e) {
		e.preventDefault();
		e.stopPropagation();
		const next = new Set(selected);
		if (next.has(fileName)) next.delete(fileName);
		else next.add(fileName);
		selected = next;
	}

	function toggleAll(e) {
		e.stopPropagation();
		if (allOnPageSelected) {
			const next = new Set(selected);
			paginated.forEach((r) => next.delete(r.fileName));
			selected = next;
		} else {
			const next = new Set(selected);
			paginated.forEach((r) => next.add(r.fileName));
			selected = next;
		}
	}

	function openDeleteModal(targets) {
		deleteModal = { open: true, targets };
	}

	function openSingleDelete(fileName, e) {
		e.preventDefault();
		e.stopPropagation();
		openDeleteModal([fileName]);
	}

	async function confirmDelete() {
		deleting = true;
		try {
			if (deleteModal.targets.length === 1) {
				await deleteReport(deleteModal.targets[0]);
			} else {
				await deleteReports(deleteModal.targets);
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

<svelte:head><title>Reports — Plum</title></svelte:head>

<Modal
	bind:open={deleteModal.open}
	title={deleteModal.targets.length === 1
		? 'Delete report?'
		: `Delete ${deleteModal.targets.length} reports?`}
>
	<p class="modal-body">
		{#if deleteModal.targets.length === 1}
			This will permanently remove the report and its data file.
		{:else}
			This will permanently remove {deleteModal.targets.length} reports and their data files.
		{/if}
	</p>
	<div class="modal-actions">
		<button class="btn-cancel" on:click={() => (deleteModal.open = false)} disabled={deleting}>
			Cancel
		</button>
		<button class="btn-danger" on:click={confirmDelete} disabled={deleting}>
			{deleting ? 'Deleting…' : 'Delete'}
		</button>
	</div>
</Modal>

<div class="page-header">
	<div class="header-top">
		<div>
			<h1>Reports</h1>
			<p class="subtitle">
				{reports.length} run{reports.length !== 1 ? 's' : ''} recorded
			</p>
		</div>

		<div class="header-actions">
			{#if someSelected}
				<button class="btn-delete-selected" on:click={() => openDeleteModal([...selected])}>
					Delete ({selected.size})
				</button>
			{/if}

			{#if reports.length > 0}
				<div class="rate-display">
					<span
						class="rate-number"
						class:pass={passRate >= 80}
						class:warn={passRate < 80 && passRate >= 50}
						class:fail={passRate < 50}
					>
						{passRate}%
					</span>
					<span class="rate-label">passing</span>
				</div>
			{/if}
		</div>
	</div>

	{#if reports.length > 0}
		<div class="stats-bar">
			<div class="pass-bar-track">
				<div class="pass-bar-fill" style="width: {animateBar ? passRate + '%' : '0'}"></div>
			</div>
			<div class="bar-legend">
				<span class="legend-pass">{passCount} passed</span>
				<span class="legend-fail">{failCount} failed</span>
			</div>
		</div>

		<div class="trend-row">
			<span class="trend-label">Recent</span>
			<div class="trend-dots">
				{#each trend as r, i}
					<span
						class="trend-dot"
						class:pass={r.status === 'PASS'}
						class:fail={r.status !== 'PASS'}
						style="animation-delay: {i * 35}ms"
						title="{r.status} · {r.tags} · {r.date}"
					></span>
				{/each}
			</div>
			<span class="trend-hint">← older · newer →</span>
		</div>
	{/if}
</div>

{#if reports.length === 0}
	<p class="empty">No reports yet. Run a test to generate one.</p>
{:else}
	<div class="list-header">
		<label class="select-all-wrap" title="Select all on this page">
			<input
				type="checkbox"
				class="checkbox"
				checked={allOnPageSelected}
				indeterminate={someSelected && !allOnPageSelected}
				on:change={toggleAll}
			/>
		</label>
	</div>

	<div class="report-list">
		{#each paginated as report, i}
			<div
				class="report-row"
				class:is-selected={selected.has(report.fileName)}
				style="animation-delay: {i * 45}ms"
			>
				<label class="row-check-wrap" title="Select">
					<input
						type="checkbox"
						class="checkbox"
						checked={selected.has(report.fileName)}
						on:change={(e) => toggleSelect(report.fileName, e)}
					/>
				</label>

				<a
					class="report-item"
					class:is-pass={report.status === 'PASS'}
					class:is-fail={report.status !== 'PASS'}
					href="/reports/{encodeURIComponent(report.fileName)}"
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
							<span class="item-tags">{report.tags}</span>
							<div class="item-badges">
								<Badge variant={triggerVariant(report.triggerType)}>
									{triggerLabel(report.triggerType)}
								</Badge>
								<Badge variant="neutral">
									{report.runners} runner{report.runners !== 1 ? 's' : ''}
								</Badge>
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
					title="Delete report"
					on:click={(e) => openSingleDelete(report.fileName, e)}
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
			<Pagination
				current={currentPage}
				total={totalPages}
				on:change={(e) => (currentPage = e.detail)}
			/>
		</div>
	{/if}
{/if}

<style>
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

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.btn-delete-selected {
		height: 32px;
		padding: 0 0.875rem;
		font-size: 0.8125rem;
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
		color: #fff;
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
		border-radius: 100px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.pass-bar-fill {
		height: 100%;
		background: var(--pass);
		border-radius: 100px;
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

	/* ── Select all row ── */
	.list-header {
		display: flex;
		align-items: center;
		padding: 0 0.5rem 0.375rem;
	}

	.select-all-wrap {
		display: flex;
		align-items: center;
		cursor: pointer;
		padding: 0.25rem;
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

	/* ── Modal ── */
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.modal-body {
		font-size: 0.9rem;
		color: var(--text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.btn-cancel {
		height: 34px;
		padding: 0 1rem;
		font-size: 0.8125rem;
		font-family: inherit;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: var(--text);
		transition: background var(--duration-fast);
	}

	.btn-cancel:hover {
		background: var(--bg-subtle);
	}

	.btn-danger {
		height: 34px;
		padding: 0 1rem;
		font-size: 0.8125rem;
		font-family: inherit;
		font-weight: 500;
		background: var(--fail);
		border: 1px solid var(--fail);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: #fff;
		transition: opacity var(--duration-fast);
	}

	.btn-danger:hover:not(:disabled) {
		opacity: 0.85;
	}
	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Misc ── */
	.pagination-wrap {
		margin-top: 1.25rem;
	}

	.empty {
		color: var(--text-muted);
		font-size: 0.9375rem;
		padding: 3rem 0;
		text-align: center;
	}
</style>
