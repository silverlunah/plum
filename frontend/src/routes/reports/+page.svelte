<!--
This file is part of Plum.

Plum is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Plum is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Plum. If not, see https://www.gnu.org/licenses/.
-->

<script>
	import { onMount } from 'svelte';
	import { fetchReports, reportUrl } from '$lib/api/reports';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	let reports = [];
	let currentPage = 1;
	const PER_PAGE = 10;

	$: totalPages = Math.ceil(reports.length / PER_PAGE);
	$: paginated = reports.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

	function triggerLabel(type) {
		if (type === 'manual-trigger') return 'Manual';
		if (type === 'command-line-trigger') return 'CLI';
		return `Scheduled`;
	}

	function triggerVariant(type) {
		if (type === 'manual-trigger') return 'tag';
		if (type === 'command-line-trigger') return 'neutral';
		return 'schedule';
	}

	function openReport(fileName) {
		window.open(reportUrl(fileName), '_blank', 'noopener');
	}

	onMount(async () => {
		try {
			reports = await fetchReports();
		} catch (e) {
			console.error('Failed to fetch reports', e);
		}
	});
</script>

<div class="page-header">
	<h1>Reports</h1>
	<p class="subtitle">Click a row to open the full HTML report</p>
</div>

<div class="card">
	{#if reports.length === 0}
		<p class="empty">No reports yet. Run a test to generate one.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Status</th>
						<th>Trigger</th>
						<th>Tags</th>
						<th>Date</th>
					</tr>
				</thead>
				<tbody>
					{#each paginated as report}
						<tr class="row" on:click={() => openReport(report.fileName)}>
							<td>
								<Badge variant={report.status === 'PASS' ? 'pass' : 'fail'}>
									{report.status}
								</Badge>
							</td>
							<td>
								<Badge variant={triggerVariant(report.triggerType)}>
									{triggerLabel(report.triggerType)}
								</Badge>
							</td>
							<td>
								<span class="tag-text">{report.tags}</span>
							</td>
							<td class="date">{report.date}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="pagination-wrap">
			<Pagination
				current={currentPage}
				total={totalPages}
				on:change={(e) => (currentPage = e.detail)}
			/>
		</div>
	{/if}
</div>

<style>
	.page-header {
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-size: 2rem;
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.card {
		padding: 0;
		overflow: hidden;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.row {
		cursor: pointer;
		transition: background var(--duration-fast);
	}

	.row:hover {
		background: var(--bg-subtle);
	}

	.tag-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.date {
		color: var(--text-muted);
		font-size: 0.8125rem;
		white-space: nowrap;
	}

	.empty {
		padding: 3rem 1.5rem;
		color: var(--text-muted);
		font-size: 0.9375rem;
		text-align: center;
	}

	.pagination-wrap {
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--border);
	}
</style>
