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
	import { onMount } from 'svelte';

	let reports = [];
	let currentPage = 1;
	const itemsPerPage = 10;

	async function fetchReports() {
		const response = await fetch('http://localhost:3001/reports');
		const data = await response.json();

		reports = data.reports.map((fileName) => {
			// Updated regex to capture the trigger type and tags inside parentheses
			const match = fileName.match(
				/(PASS|FAIL)_cucumber_report_([^_]+)_\(([^)]+)\)_(\d{4})_(\d{2})_(\d{2})T(\d{2})_(\d{2})_(\d{2})_\d{3}Z\.html/
			);
			if (!match)
				return {
					fileName,
					status: 'Unknown',
					triggerType: 'Invalid Trigger',
					tags: 'Invalid Tags',
					date: 'Invalid Date'
				};

			const [_, status, triggerType, tagsString, year, month, day, hour, minute, second] = match;

			// Format date properly
			const rawDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
			const formattedDate = rawDate.toLocaleString();

			return { fileName, status, triggerType, tags: tagsString, date: formattedDate };
		});
	}

	// Calculate the start and end indices for pagination
	function paginatedReports() {
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		return reports.slice(startIndex, endIndex);
	}

	function goToPage(pageNumber) {
		if (pageNumber < 1 || pageNumber > totalPages()) return;
		currentPage = pageNumber;
	}

	function totalPages() {
		return Math.ceil(reports.length / itemsPerPage);
	}

	onMount(fetchReports);
</script>

<div class="flex justify-center items-center w-full my-4">
	<div class="card bg-base-300 rounded-box p-4">
		<div class="card-body text-left">
			<h2 class="card-title sticky top-0 bg-base-300 z-10">Reports</h2>
			<div class="mt-4">
				{#if reports.length > 0}
					<div class="overflow-x-auto">
						<table class="table">
							<thead>
								<tr>
									<th>Status</th>
									<th>Type</th>
									<th>Tags</th>
									<th>Date</th>
								</tr>
							</thead>
							<tbody>
								{#each paginatedReports() as report}
									<tr
										on:click={() =>
											window.open(`http://localhost:3001/reports/${report.fileName}`, '_blank')}
										style="cursor: pointer;"
									>
										<td>
											<span
												class="badge"
												class:badge-success={report.status === 'PASS'}
												class:badge-error={report.status === 'FAIL'}
											>
												{report.status}
											</span>
										</td>
										<td>
											{#if report.triggerType === 'manual-trigger'}
												<span class="badge badge-primary">Manual Trigger</span>
											{:else}
												<span class="badge badge-secondary">Scheduled: {report.triggerType}</span>
											{/if}
										</td>
										<td>
											<span class="badge badge-neutral">
												{report.tags}
											</span>
										</td>
										<td>
											{report.date}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<!-- Pagination Controls -->
					<div class="flex justify-center mt-4">
						<div class="btn-group">
							<button
								class="btn btn-ghost"
								on:click={() => goToPage(currentPage - 1)}
								disabled={currentPage === 1}
							>
								Previous
							</button>
							{#each Array(totalPages()) as _, i}
								<button
									class="btn mx-1"
									on:click={() => goToPage(i + 1)}
									class:btn-active={currentPage === i + 1}
								>
									{i + 1}
								</button>
							{/each}
							<button
								class="btn btn-primary"
								on:click={() => goToPage(currentPage + 1)}
								disabled={currentPage === totalPages()}
							>
								Next
							</button>
						</div>
					</div>
				{:else}
					<p>No reports available.</p>
				{/if}
			</div>
		</div>
	</div>
</div>
