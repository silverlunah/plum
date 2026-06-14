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
	import { slide } from 'svelte/transition';
	import { fetchSuites } from '$lib/api/tests';
	import { runnerConfig, triggerRun } from '$lib/stores/runner';

	let suites = [];
	let search = '';
	let expandedSteps = new Set();

	onMount(async () => {
		try {
			suites = await fetchSuites();
		} catch (e) {
			console.error('Failed to fetch suites', e);
		}
	});

	function suiteIds(suite) {
		return Array.isArray(suite.suiteId) ? suite.suiteId : [suite.suiteId];
	}

	function testIds(test) {
		return Array.isArray(test.id) ? test.id : [test.id];
	}

	function primaryId(test) {
		return Array.isArray(test.id) ? test.id[0] : test.id;
	}

	function toggleSteps(id) {
		if (expandedSteps.has(id)) {
			expandedSteps.delete(id);
		} else {
			expandedSteps.add(id);
		}
		expandedSteps = expandedSteps;
	}

	function run(id) {
		runnerConfig.update((c) => ({ ...c, testID: id }));
		triggerRun(id);
	}

	function runSuite(suite) {
		const id = suiteIds(suite)[0];
		run(id);
	}

	async function copyId(id) {
		await navigator.clipboard.writeText(id);
	}

	$: q = search.trim().toLowerCase();
	$: filtered = suites
		.map((suite) => {
			if (!q) return suite;
			const suiteMatches = suite.suiteName.toLowerCase().includes(q);
			const matchedTests = suite.tests.filter(
				(t) =>
					t.testCase.toLowerCase().includes(q) ||
					testIds(t).some((id) => id.toLowerCase().includes(q))
			);
			if (!suiteMatches && matchedTests.length === 0) return null;
			return { ...suite, tests: suiteMatches ? suite.tests : matchedTests };
		})
		.filter(Boolean);

	$: totalTests = suites.reduce((n, s) => n + s.tests.length, 0);
	$: visibleTests = filtered.reduce((n, s) => n + s.tests.length, 0);
</script>

<div class="page-header">
	<div class="header-top">
		<div>
			<h1>Tests</h1>
			<p class="subtitle">
				{#if q}
					{visibleTests} of {totalTests} tests
				{:else}
					{suites.length} suite{suites.length !== 1 ? 's' : ''} · {totalTests} test{totalTests !== 1
						? 's'
						: ''}
				{/if}
			</p>
		</div>
	</div>

	<div class="search-row">
		<div class="search-wrap">
			<svg
				class="search-icon"
				width="14"
				height="14"
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
				class="search-input"
				bind:value={search}
				placeholder="Search suites or tests…"
			/>
			{#if search}
				<button class="search-clear" on:click={() => (search = '')} aria-label="Clear search">
					<svg width="12" height="12" viewBox="0 0 14 14" fill="none">
						<path
							d="M1 1l12 12M13 1L1 13"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>
</div>

{#if filtered.length === 0}
	<p class="empty">
		{q ? `No tests matching "${search}"` : 'No test suites found.'}
	</p>
{:else}
	<div class="suites">
		{#each filtered as suite, si}
			<div class="suite" style="animation-delay: {si * 55}ms">
				<div class="suite-header">
					<div class="suite-meta">
						<div class="suite-badges">
							{#each suiteIds(suite) as id}
								<button class="id-pill" on:click={() => copyId(id)} title="Copy {id}">{id}</button>
							{/each}
						</div>
						<span class="suite-name">{suite.suiteName}</span>
						<span class="suite-count"
							>{suite.tests.length} test{suite.tests.length !== 1 ? 's' : ''}</span
						>
					</div>
					<button class="run-btn suite-run" on:click={() => runSuite(suite)} title="Run suite">
						<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
							<polygon points="5,3 19,12 5,21" />
						</svg>
						Run suite
					</button>
				</div>

				<div class="tests">
					{#each suite.tests as test, ti}
						{@const pid = primaryId(test)}
						{@const stepsOpen = expandedSteps.has(pid)}
						<div class="test-row" style="animation-delay: {(si * 4 + ti) * 30}ms">
							<div class="test-main">
								<button
									class="run-icon-btn"
									on:click={() => run(pid)}
									title="Run {pid}"
									aria-label="Run {test.testCase}"
								>
									<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
										<polygon points="5,3 19,12 5,21" />
									</svg>
								</button>

								<div class="test-ids">
									{#each testIds(test) as id}
										<button class="id-pill" on:click={() => copyId(id)} title="Copy {id}">{id}</button>
									{/each}
								</div>

								<span class="test-name">
									{test.testCase}
									{#if test.type === 'outline'}
										<span class="outline-badge">outline</span>
									{/if}
								</span>

								{#if test.steps?.length > 0}
									<button
										class="steps-toggle"
										on:click={() => toggleSteps(pid)}
										aria-expanded={stepsOpen}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											class:rotated={stepsOpen}
										>
											<polyline points="9 18 15 12 9 6" />
										</svg>
										{stepsOpen ? 'Hide' : 'Steps'}
									</button>
								{/if}
							</div>

							{#if stepsOpen && test.steps?.length > 0}
								<div class="steps" transition:slide={{ duration: 180 }}>
									<ol class="step-list">
										{#each test.steps as step}
											<li class="step">{step}</li>
										{/each}
									</ol>

									{#if test.examples}
										<div class="examples">
											<span class="examples-label">Examples</span>
											<div class="examples-table-wrap">
												<table class="examples-table">
													<thead>
														<tr>
															{#each test.examples.headers as h}
																<th>{h}</th>
															{/each}
														</tr>
													</thead>
													<tbody>
														{#each test.examples.rows as row}
															<tr>
																{#each row as cell}
																	<td>{cell}</td>
																{/each}
															</tr>
														{/each}
													</tbody>
												</table>
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.page-header {
		margin-bottom: 1.75rem;
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

	/* ── Search ── */
	.search-row {
		display: flex;
		gap: 0.75rem;
	}

	.search-wrap {
		position: relative;
		flex: 1;
		max-width: 480px;
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-muted);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 0.55rem 0.875rem 0.55rem 2.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-subtle);
		color: var(--text);
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 300;
		outline: none;
		transition:
			border-color var(--duration-fast),
			box-shadow var(--duration-fast);
	}

	.search-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
		background: var(--bg-elevated);
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}

	.search-clear {
		position: absolute;
		right: 0.625rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: none;
		background: var(--border);
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.search-clear:hover {
		background: var(--text-muted);
		color: var(--bg);
	}

	/* ── Suites ── */
	.suites {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.suite {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--bg-elevated);
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.suite-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1.25rem;
		background: var(--bg-subtle);
		border-bottom: 1px solid var(--border);
	}

	.suite-meta {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex: 1;
		min-width: 0;
	}

	.suite-badges {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.suite-name {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.suite-count {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.run-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 400;
		padding: 0.3rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.run-btn:hover {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}

	/* ── Tests ── */
	.tests {
		display: flex;
		flex-direction: column;
	}

	.test-row {
		border-bottom: 1px solid var(--border);
		animation: fadeUp 0.3s var(--ease-out) both;
	}

	.test-row:last-child {
		border-bottom: none;
	}

	.test-main {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.75rem 1.25rem;
	}

	.run-icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.run-icon-btn:hover {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.test-ids {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.id-pill {
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--accent);
		background: var(--accent-soft);
		border: none;
		border-radius: 100px;
		padding: 0.15rem 0.55rem;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition:
			background var(--duration-fast),
			filter var(--duration-fast);
	}

	.id-pill:hover {
		filter: brightness(0.92);
	}

	.test-name {
		flex: 1;
		font-size: 0.875rem;
		color: var(--text);
		min-width: 0;
	}

	.outline-badge {
		display: inline-block;
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: var(--warn-soft);
		color: var(--warn);
		padding: 0.1rem 0.4rem;
		border-radius: 100px;
		margin-left: 0.4rem;
		vertical-align: middle;
	}

	.steps-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 400;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.steps-toggle:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.steps-toggle svg {
		transition: transform var(--duration-fast) var(--ease-out);
	}

	.steps-toggle svg.rotated {
		transform: rotate(90deg);
	}

	/* ── Steps panel ── */
	.steps {
		padding: 0.75rem 1.25rem 0.875rem 3.75rem;
		background: var(--bg-subtle);
		border-top: 1px solid var(--border);
	}

	.step-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.step {
		font-size: 0.8125rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		line-height: 1.5;
		padding-left: 1rem;
		position: relative;
	}

	.step::before {
		content: '›';
		position: absolute;
		left: 0;
		color: var(--accent);
		font-family: var(--font-body);
	}

	/* ── Examples table ── */
	.examples {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--border);
	}

	.examples-label {
		display: block;
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
	}

	.examples-table-wrap {
		overflow-x: auto;
	}

	.examples-table {
		border-collapse: collapse;
		font-size: 0.78rem;
		font-family: 'JetBrains Mono', monospace;
		width: auto;
	}

	.examples-table th {
		text-align: left;
		padding: 0.3rem 0.75rem;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		font-family: var(--font-body);
		font-weight: 500;
	}

	.examples-table td {
		padding: 0.3rem 0.75rem;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
	}

	.examples-table tbody tr:last-child td {
		border-bottom: none;
	}

	.empty {
		color: var(--text-muted);
		font-size: 0.9375rem;
		padding: 3rem 0;
		text-align: center;
	}
</style>
