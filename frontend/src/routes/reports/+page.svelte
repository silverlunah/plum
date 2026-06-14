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
	import { fetchReports } from '$lib/api/reports';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	let reports = [];
	let currentPage = 1;
	const PER_PAGE = 15;
	let animateBar = false;

	$: totalPages = Math.ceil(reports.length / PER_PAGE);
	$: paginated = reports.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
	$: passCount = reports.filter((r) => r.status === 'PASS').length;
	$: failCount = reports.length - passCount;
	$: passRate = reports.length ? Math.round((passCount / reports.length) * 100) : 0;
	$: trend = reports.slice(0, 12).reverse();

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

	onMount(async () => {
		try {
			reports = await fetchReports();
			await tick();
			animateBar = true;
		} catch (e) {
			console.error('Failed to fetch reports', e);
		}
	});
</script>

<div class="page-header">
	<div class="header-top">
		<div>
			<h1>Reports</h1>
			<p class="subtitle">
				{reports.length} run{reports.length !== 1 ? 's' : ''} recorded
			</p>
		</div>

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
	<div class="report-list">
		{#each paginated as report, i}
			<a
				class="report-item"
				class:is-pass={report.status === 'PASS'}
				class:is-fail={report.status !== 'PASS'}
				href="/reports/{encodeURIComponent(report.fileName)}"
				style="animation-delay: {i * 45}ms"
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

	/* ── Report list ── */
	.report-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.report-item {
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
		animation: fadeUp 0.32s var(--ease-out) both;
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
