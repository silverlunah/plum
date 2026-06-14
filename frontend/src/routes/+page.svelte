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
	import { fly } from 'svelte/transition';
	import { io } from 'socket.io-client';
	import { fetchSuites } from '$lib/api/tests';
	import { fetchLatestReport, reportUrl } from '$lib/api/reports';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Terminal from '$lib/components/ui/Terminal.svelte';

	let output = 'Ready — enter a test ID or select one from the list.\n';
	let socket;
	let testID = '';
	let workers = 1;
	let running = false;
	let testCompleted = false;
	let latestReport = null;
	let suites = [];

	const WORKER_OPTIONS = [1, 2, 4, 8];

	onMount(async () => {
		socket = io('http://localhost:3001');

		socket.on('log', (data) => {
			output += data + '\n';
		});

		socket.on('done', async () => {
			output += '✓ Test completed\n';
			running = false;
			testCompleted = true;
			latestReport = await fetchLatestReport();
		});

		try {
			suites = await fetchSuites();
		} catch (e) {
			console.error('Failed to fetch suites', e);
		}
	});

	function runTest() {
		const id = testID.trim().replace(/\sOR\s/gi, (m) => m.toLowerCase());
		const workerLabel = workers > 1 ? ` · ${workers} workers` : '';
		output = `Running: ${id || '(all tests)'}${workerLabel}\n`;
		testCompleted = false;
		running = true;
		socket.emit('run-test', id, workers);
	}

	function selectId(id) {
		testID = id;
	}

	function suiteIds(suite) {
		return Array.isArray(suite.suiteId) ? suite.suiteId : [suite.suiteId];
	}

	function testIds(test) {
		return Array.isArray(test.id) ? test.id : [test.id];
	}
</script>

<div class="page-header">
	<h1>Run Tests</h1>
	<p class="subtitle">Trigger test runs manually or select a suite from the list</p>
</div>

<div class="layout">
	<!-- Left: runner -->
	<section class="card">
		<div class="input-row">
			<input
				type="text"
				class="field-input"
				bind:value={testID}
				placeholder="@test-1 or @suite-login"
				on:keydown={(e) => e.key === 'Enter' && !running && runTest()}
			/>
			<Button on:click={runTest} disabled={running}>
				{running ? 'Running…' : 'Run'}
			</Button>
		</div>

		<div class="workers-row">
			<span class="workers-label">
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
					<rect x="2" y="3" width="20" height="14" rx="2" /><line
						x1="8"
						y1="21"
						x2="16"
						y2="21"
					/><line x1="12" y1="17" x2="12" y2="21" />
				</svg>
				Workers
			</span>
			<div class="workers-control">
				{#each WORKER_OPTIONS as n}
					<button class="worker-btn" class:active={workers === n} on:click={() => (workers = n)}>
						{n === 1 ? 'Off' : n}
					</button>
				{/each}
			</div>
			{#if workers > 1}
				<span class="workers-hint">{workers} parallel runners</span>
			{/if}
		</div>

		<Terminal {output} />

		{#if testCompleted && latestReport}
			<div transition:fly={{ y: 6, duration: 240 }} class="report-link">
				<a href={reportUrl(latestReport)} target="_blank" rel="noopener noreferrer">
					<Button variant="outline" size="sm">View Report →</Button>
				</a>
			</div>
		{/if}
	</section>

	<!-- Right: test list -->
	<section class="card suite-card">
		<p class="card-title">Test List</p>
		<p class="card-subtitle">Click an ID to load it into the runner</p>

		{#if suites.length === 0}
			<p class="empty">No test suites found.</p>
		{:else}
			<div class="suites">
				{#each suites as suite, i}
					<details class="suite" style="animation-delay: {i * 55}ms">
						<summary class="suite-header">
							<div class="suite-badges">
								{#each suiteIds(suite) as id}
									<Badge variant="tag">{id}</Badge>
								{/each}
							</div>
							<span class="suite-name">{suite.suiteName}</span>
							<svg
								class="chevron"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							>
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</summary>

						<div class="suite-body">
							<button class="select-suite-btn" on:click={() => selectId(suiteIds(suite)[0])}>
								Run entire suite
							</button>
							<table class="data-table">
								<thead>
									<tr>
										<th>ID</th>
										<th>Test Case</th>
									</tr>
								</thead>
								<tbody>
									{#each suite.tests as test}
										<tr>
											<td class="id-cell">
												{#each testIds(test) as id}
													<button class="id-btn" on:click={() => selectId(id)}>{id}</button>
												{/each}
											</td>
											<td>{test.testCase}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.page-header h1 {
		font-size: 2.5rem;
		margin-bottom: 0.375rem;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.layout {
		display: grid;
		grid-template-columns: 1fr 1.35fr;
		gap: 1.25rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}

	/* Runner card */
	.input-row {
		display: flex;
		gap: 0.625rem;
		margin-bottom: 0.875rem;
	}

	.input-row .field-input {
		flex: 1;
	}

	.workers-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.875rem;
	}

	.workers-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex-shrink: 0;
	}

	.workers-control {
		display: flex;
		gap: 2px;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 2px;
	}

	.worker-btn {
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 400;
		min-width: 2rem;
		padding: 0.2rem 0.5rem;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.worker-btn:hover:not(.active) {
		background: var(--bg-elevated);
		color: var(--text);
	}

	.worker-btn.active {
		background: var(--bg-elevated);
		color: var(--accent);
		font-weight: 500;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.workers-hint {
		font-size: 0.75rem;
		color: var(--accent);
		font-weight: 400;
	}

	.report-link {
		margin-top: 0.875rem;
	}

	/* Suite card */
	.suite-card {
		padding: 0;
		overflow: hidden;
	}

	.suite-card .card-title,
	.suite-card .card-subtitle {
		padding: 1.5rem 1.5rem 0;
	}

	.suite-card .card-subtitle {
		margin-bottom: 1rem;
	}

	.suites {
		display: flex;
		flex-direction: column;
	}

	.suite {
		border-top: 1px solid var(--border);
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.suite:first-child {
		border-top: none;
	}

	.suite-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1.5rem;
		cursor: pointer;
		list-style: none;
		transition: background var(--duration-fast);
	}

	.suite-header::-webkit-details-marker {
		display: none;
	}

	.suite-header:hover {
		background: var(--bg-subtle);
	}

	.suite-badges {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.suite-name {
		flex: 1;
		font-size: 0.875rem;
		color: var(--text);
		font-weight: 400;
	}

	.chevron {
		color: var(--text-muted);
		flex-shrink: 0;
		transition: transform var(--duration-fast) var(--ease-out);
	}

	details[open] .chevron {
		transform: rotate(90deg);
	}

	.suite-body {
		padding: 0.75rem 1.5rem 1rem;
		border-top: 1px solid var(--border);
		background: var(--bg-subtle);
	}

	.select-suite-btn {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--accent);
		background: var(--accent-soft);
		border: none;
		border-radius: var(--radius-sm);
		padding: 0.25rem 0.75rem;
		cursor: pointer;
		margin-bottom: 0.75rem;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.select-suite-btn:hover {
		filter: brightness(0.95);
	}

	.id-cell {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.id-btn {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border: none;
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.5rem;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition:
			background var(--duration-fast),
			filter var(--duration-fast);
	}

	.id-btn:hover {
		filter: brightness(0.92);
	}

	.empty {
		padding: 1.5rem;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
