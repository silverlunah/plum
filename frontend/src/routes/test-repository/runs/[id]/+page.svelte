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
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';
	import { fetchRun, updateRun, fetchSuites, recordEntryResult } from '$lib/api/repository';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import { TOAST_TIMEOUT_MS } from '$lib/constants';

	const runId = $page.params.id;

	/** @type {'build' | 'execute'} */
	let mode = 'build';

	let run = null;
	let suites = [];
	let loading = true;
	let toast = null;
	let saving = false;
	let executing = false;

	let search = '';
	let expandedSuites = new Set();

	let dragOver = false;
	let dragEntryId = null;
	let dragOverEntryId = null;

	let executingEntryId = null;
	let entryNote = '';

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	onMount(async () => {
		try {
			[run, suites] = await Promise.all([fetchRun(runId), fetchSuites({ withCases: true })]);
			expandedSuites = new Set(suites.map((s) => s.id));
		} catch (e) {
			showToast('error', 'Failed to load data');
		} finally {
			loading = false;
		}
	});

	$: runCaseIds = new Set(run?.entries.map((e) => e.case.id) ?? []);

	$: filteredSuites = suites
		.map((suite) => ({
			...suite,
			cases: (suite.cases ?? []).filter(
				(tc) =>
					!runCaseIds.has(tc.id) &&
					(!search ||
						tc.title.toLowerCase().includes(search.toLowerCase()) ||
						tc.displayId.toLowerCase().includes(search.toLowerCase()))
			)
		}))
		.filter(
			(suite) =>
				!search || suite.cases.length > 0 || suite.name.toLowerCase().includes(search.toLowerCase())
		);

	function addCase(tc) {
		if (!run || runCaseIds.has(tc.id)) return;
		const entry = {
			id: `tmp-${tc.id}`,
			order: run.entries.length,
			status: 'pending',
			notes: '',
			executedAt: null,
			executedBy: null,
			case: tc
		};
		run = { ...run, entries: [...run.entries, entry] };
	}

	function removeEntry(entryId) {
		run = { ...run, entries: run.entries.filter((e) => e.id !== entryId) };
	}

	async function handleSaveRun() {
		saving = true;
		try {
			const caseIds = run.entries.map((e) => e.case.id);
			const updated = await updateRun(runId, { caseIds });
			run = await fetchRun(runId);
			showToast('success', 'Run saved.');
		} catch (e) {
			showToast('error', e.message);
		} finally {
			saving = false;
		}
	}

	async function handleStartExecution() {
		await handleSaveRun();
		await updateRun(runId, { status: 'in-progress' });
		run = { ...run, status: 'in-progress' };
		mode = 'execute';
	}

	async function handleMarkEntry(entry, status) {
		executingEntryId = entry.id;
		try {
			const updated = await recordEntryResult(entry.id, { status, notes: entryNote });
			run = {
				...run,
				entries: run.entries.map((e) => (e.id === entry.id ? { ...e, ...updated, status } : e))
			};
			entryNote = '';
		} catch (e) {
			showToast('error', e.message);
		} finally {
			executingEntryId = null;
		}
	}

	async function handleCompleteRun() {
		try {
			await updateRun(runId, { status: 'complete' });
			run = { ...run, status: 'complete' };
			showToast('success', 'Run marked as complete.');
		} catch (e) {
			showToast('error', e.message);
		}
	}

	async function handleReopenRun() {
		try {
			await updateRun(runId, { status: 'draft' });
			run = { ...run, status: 'draft' };
			mode = 'build';
			showToast('success', 'Run reopened.');
		} catch (e) {
			showToast('error', e.message);
		}
	}

	$: isLocked = run?.status === 'complete';

	function onDragStart(e, entryId) {
		dragEntryId = entryId;
		e.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(e, entryId) {
		e.preventDefault();
		dragOverEntryId = entryId;
	}

	function onDrop(e, targetEntryId) {
		e.preventDefault();
		if (!dragEntryId || dragEntryId === targetEntryId) return;
		const entries = [...run.entries];
		const fromIdx = entries.findIndex((e) => e.id === dragEntryId);
		const toIdx = entries.findIndex((e) => e.id === targetEntryId);
		const [moved] = entries.splice(fromIdx, 1);
		entries.splice(toIdx, 0, moved);
		run = { ...run, entries };
		dragEntryId = null;
		dragOverEntryId = null;
	}

	function priorityClass(p) {
		return p?.toLowerCase() ?? 'medium';
	}

	function statusClass(s) {
		if (s === 'pass') return 'pass';
		if (s === 'fail') return 'fail';
		if (s === 'blocked') return 'warn';
		if (s === 'skip') return 'muted';
		return 'pending';
	}

	$: completedCount = run?.entries.filter((e) => e.status !== 'pending').length ?? 0;
	$: totalCount = run?.entries.length ?? 0;
	$: passCount = run?.entries.filter((e) => e.status === 'pass').length ?? 0;
	$: failCount = run?.entries.filter((e) => e.status === 'fail').length ?? 0;
</script>

<svelte:head><title>{run?.title ?? 'Test Run'} — Plum</title></svelte:head>

<Toast {toast} />

<div class="breadcrumb">
	<a href="/test-repository" class="bc-link">Test Repository</a>
	<span class="bc-sep">›</span>
	<span class="bc-current">{run?.title ?? '…'}</span>
</div>

{#if loading}
	<div class="loading-state">Loading…</div>
{:else if run}
	<div class="run-header">
		<div class="run-header-left">
			<h1 class="run-title">{run.title}</h1>
			<span class="run-status-badge {run.status}">{run.status}</span>
		</div>
		<div class="run-header-actions">
			{#if isLocked}
				<Button variant="ghost" on:click={handleReopenRun}>Reopen</Button>
			{:else if mode === 'build'}
				<Button variant="ghost" on:click={handleSaveRun} disabled={saving}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
				{#if run.entries.length > 0}
					<Button on:click={handleStartExecution}>Start Execution</Button>
				{/if}
			{:else}
				<Button variant="ghost" on:click={() => (mode = 'build')}>← Edit Run</Button>
				<Button on:click={handleCompleteRun}>Mark Complete</Button>
			{/if}
		</div>
	</div>

	<!-- Mode tabs -->
	<div class="mode-tabs">
		<button class="mode-tab" class:active={mode === 'build'} on:click={() => (mode = 'build')}>
			Build
		</button>
		<button class="mode-tab" class:active={mode === 'execute'} on:click={() => (mode = 'execute')}>
			Execute
			{#if totalCount > 0}
				<span class="exec-progress">{completedCount}/{totalCount}</span>
			{/if}
		</button>
	</div>

	{#if mode === 'build'}
		<div
			class="builder-workspace"
			class:locked-workspace={isLocked}
			transition:fly={{ y: 4, duration: 150 }}
		>
			<!-- Left: run entries -->
			<div class="builder-panel left-panel">
				<div class="builder-panel-head">
					<h2 class="builder-panel-title">In this run</h2>
					<span class="count-chip">{run.entries.length}</span>
					{#if isLocked}
						<span class="locked-badge">locked</span>
					{/if}
				</div>

				{#if run.entries.length === 0}
					<div class="drop-hint">No cases in this run.</div>
				{:else}
					<div class="entry-list" role="list">
						{#each run.entries as entry (entry.id)}
							<div
								class="entry-row"
								class:entry-locked={isLocked}
								role="listitem"
								draggable={!isLocked}
								on:dragstart={isLocked ? null : (e) => onDragStart(e, entry.id)}
								on:dragover={isLocked ? null : (e) => onDragOver(e, entry.id)}
								on:dragleave={isLocked ? null : () => (dragOverEntryId = null)}
								on:drop={isLocked ? null : (e) => onDrop(e, entry.id)}
								class:dragging={dragEntryId === entry.id}
								class:drag-over={dragOverEntryId === entry.id}
							>
								{#if !isLocked}
									<svg
										class="drag-handle"
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="currentColor"
									>
										<circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
										<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
										<circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
									</svg>
								{/if}
								<div class="entry-info">
									<div class="entry-badges">
										<span class="id-chip">{entry.case.displayId}</span>
										<span class="priority-badge {priorityClass(entry.case.priority)}"
											>{entry.case.priority}</span
										>
									</div>
									<p class="entry-title">{entry.case.title}</p>
									<span class="entry-suite">{entry.case.suite?.name ?? ''}</span>
								</div>
								{#if !isLocked}
									<button class="icon-btn danger" on:click={() => removeEntry(entry.id)}>
										<svg width="11" height="11" viewBox="0 0 14 14" fill="none"
											><path
												d="M1 1l12 12M13 1L1 13"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/></svg
										>
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right: suite browser (hidden when locked) -->
			{#if !isLocked}
				<div class="builder-panel right-panel">
					<div class="builder-panel-head">
						<h2 class="builder-panel-title">Suite browser</h2>
						<input
							type="text"
							class="search-input"
							bind:value={search}
							placeholder="Search cases…"
						/>
					</div>

					<div class="suite-browser">
						{#each filteredSuites as suite (suite.id)}
							<div class="browser-suite">
								<button
									class="browser-suite-header"
									on:click={() => {
										if (expandedSuites.has(suite.id)) expandedSuites.delete(suite.id);
										else expandedSuites.add(suite.id);
										expandedSuites = new Set(expandedSuites);
									}}
								>
									<svg
										class="chevron"
										class:open={expandedSuites.has(suite.id)}
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"><polyline points="9 18 15 12 9 6" /></svg
									>
									<span class="browser-suite-name">{suite.name}</span>
									<span class="browser-suite-count">{suite.cases?.length ?? 0}</span>
								</button>
								{#if expandedSuites.has(suite.id) && suite.cases?.length > 0}
									<div class="browser-cases" transition:fly={{ y: -4, duration: 120 }}>
										{#each suite.cases as tc (tc.id)}
											<button class="browser-case" on:click={() => addCase(tc)}>
												<span class="id-chip small">{tc.displayId}</span>
												<span class="browser-case-title">{tc.title}</span>
												<span class="priority-badge small {priorityClass(tc.priority)}"
													>{tc.priority}</span
												>
											</button>
										{/each}
									</div>
								{:else if expandedSuites.has(suite.id)}
									<p class="browser-empty">{search ? 'No matching cases' : 'All cases added'}</p>
								{/if}
							</div>
						{/each}
						{#if filteredSuites.length === 0}
							<p class="browser-empty">No suites available.</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="execute-workspace" transition:fly={{ y: 4, duration: 150 }}>
			<!-- Progress bar -->
			{#if totalCount > 0}
				<div class="progress-bar-wrap">
					<div class="progress-stats">
						<span class="stat pass">{passCount} passed</span>
						<span class="stat fail">{failCount} failed</span>
						<span class="stat muted">{totalCount - completedCount} remaining</span>
					</div>
					<div class="progress-bar">
						<div class="progress-fill pass" style="width: {(passCount / totalCount) * 100}%"></div>
						<div class="progress-fill fail" style="width: {(failCount / totalCount) * 100}%"></div>
					</div>
				</div>
			{/if}

			<div class="execute-list">
				{#each run.entries as entry (entry.id)}
					<div class="execute-row" class:expanded={executingEntryId === entry.id}>
						<div class="execute-row-main">
							<div class="exec-info">
								<span class="id-chip">{entry.case.displayId}</span>
								<div>
									<p class="exec-title">{entry.case.title}</p>
									<span class="exec-suite">{entry.case.suite?.name ?? ''}</span>
								</div>
							</div>
							<div class="exec-actions">
								{#if isLocked}
									<span class="result-chip {statusClass(entry.status)}">{entry.status}</span>
								{:else if entry.status === 'pending'}
									<button
										class="exec-btn pass"
										on:click={() => handleMarkEntry(entry, 'pass')}
										title="Pass">✓</button
									>
									<button
										class="exec-btn fail"
										on:click={() => handleMarkEntry(entry, 'fail')}
										title="Fail">✗</button
									>
									<button
										class="exec-btn warn"
										on:click={() => handleMarkEntry(entry, 'blocked')}
										title="Blocked">⊘</button
									>
									<button
										class="exec-btn muted"
										on:click={() => handleMarkEntry(entry, 'skip')}
										title="Skip">→</button
									>
								{:else}
									<span class="result-chip {statusClass(entry.status)}">{entry.status}</span>
									<button
										class="exec-reset"
										on:click={() => handleMarkEntry(entry, 'pending')}
										title="Reset">↩</button
									>
								{/if}
							</div>
						</div>

						<!-- Step viewer for current entry -->
						{#if entry.case.steps && entry.case.steps.length > 0}
							<div class="exec-steps">
								{#each entry.case.steps as step, i}
									<div class="exec-step">
										<span class="exec-step-num">{i + 1}</span>
										<div class="exec-step-body">
											<p class="exec-step-action">{step.action}</p>
											{#if step.testData}
												<p class="exec-step-data">Data: {step.testData}</p>
											{/if}
											{#if step.expectedOutput}
												<p class="exec-step-expected">Expected: {step.expectedOutput}</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/if}

<style>
	.loading-state {
		font-size: 0.875rem;
		color: var(--text-muted);
		padding: 3rem 0;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin-bottom: 1.5rem;
	}

	.bc-link {
		color: var(--accent);
		text-decoration: none;
	}
	.bc-link:hover {
		text-decoration: underline;
	}
	.bc-sep {
		color: var(--border);
	}

	/* ── Run header ── */
	.run-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.run-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.run-title {
		font-size: 1.75rem;
		font-weight: 600;
		color: var(--text);
	}

	.run-status-badge {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: capitalize;
		border-radius: 100px;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--border);
		color: var(--text-muted);
		background: var(--bg-subtle);
	}

	.run-status-badge.complete {
		background: var(--pass-soft);
		color: var(--pass);
		border-color: var(--pass);
	}

	.locked-badge {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 0.1rem 0.45rem;
		margin-left: auto;
	}

	.locked-workspace {
		grid-template-columns: 1fr;
	}

	.entry-row.entry-locked {
		cursor: default;
	}
	.entry-row.entry-locked:hover {
		border-color: var(--border);
	}
	.run-status-badge.in-progress {
		background: var(--warn-soft);
		color: var(--warn);
		border-color: var(--warn);
	}

	.run-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* ── Mode tabs ── */
	.mode-tabs {
		display: flex;
		gap: 0.125rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 1.5rem;
	}

	.mode-tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem 0.625rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		margin-bottom: -1px;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.mode-tab:hover {
		color: var(--text);
	}
	.mode-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
		font-weight: 500;
	}

	.exec-progress {
		font-size: 0.7rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 0.05rem 0.4rem;
		color: var(--text-muted);
	}

	/* ── Builder ── */
	.builder-workspace {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.5rem;
		align-items: start;
	}

	.builder-panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.builder-panel-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
	}

	.builder-panel-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
	}

	.count-chip {
		font-size: 0.7rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 0.05rem 0.4rem;
		color: var(--text-muted);
	}

	.search-input {
		flex: 1;
		height: 28px;
		padding: 0 0.625rem;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		outline: none;
	}

	.search-input:focus {
		border-color: var(--accent);
	}

	.drop-hint {
		padding: 2rem 1.25rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-align: center;
		line-height: 1.6;
	}

	.entry-list {
		padding: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-height: 120px;
	}

	.entry-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: grab;
		transition:
			border-color var(--duration-fast),
			opacity var(--duration-fast);
	}

	.entry-row:hover {
		border-color: var(--accent);
	}
	.entry-row.dragging {
		opacity: 0.4;
	}
	.entry-row.drag-over {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.drag-handle {
		color: var(--border);
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.entry-info {
		flex: 1;
		min-width: 0;
	}

	.entry-badges {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
	}

	.entry-title {
		font-size: 0.8125rem;
		color: var(--text);
		line-height: 1.4;
	}

	.entry-suite {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	/* ── Suite browser ── */
	.suite-browser {
		padding: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 60vh;
		overflow-y: auto;
	}

	.browser-suite {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.browser-suite-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--bg-subtle);
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-body);
		transition: background var(--duration-fast);
	}

	.browser-suite-header:hover {
		background: var(--bg);
	}

	.chevron {
		color: var(--text-muted);
		transition: transform var(--duration-fast);
		flex-shrink: 0;
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.browser-suite-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
		flex: 1;
	}

	.browser-suite-count {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.browser-cases {
		display: flex;
		flex-direction: column;
		gap: 0;
		border-top: 1px solid var(--border);
	}

	.browser-case {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--bg-elevated);
		border: none;
		border-top: 1px solid var(--border);
		cursor: pointer;
		text-align: left;
		font-family: var(--font-body);
		transition: background var(--duration-fast);
	}

	.browser-case:first-child {
		border-top: none;
	}
	.browser-case:hover {
		background: var(--accent-soft);
	}

	.browser-case-title {
		font-size: 0.8125rem;
		color: var(--text);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.browser-empty {
		padding: 0.625rem 0.75rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* ── Execute ── */
	.execute-workspace {
	}

	.progress-bar-wrap {
		margin-bottom: 1.25rem;
	}

	.progress-stats {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.stat {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.stat.pass {
		color: var(--pass);
	}
	.stat.fail {
		color: var(--fail);
	}
	.stat.muted {
		color: var(--text-muted);
	}

	.progress-bar {
		height: 6px;
		background: var(--bg-subtle);
		border-radius: 100px;
		overflow: hidden;
		display: flex;
	}

	.progress-fill {
		height: 100%;
		border-radius: 100px;
		transition: width 0.3s var(--ease-out);
	}

	.progress-fill.pass {
		background: var(--pass);
	}
	.progress-fill.fail {
		background: var(--fail);
	}

	.execute-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.execute-row {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		transition: border-color var(--duration-fast);
	}

	.execute-row:hover {
		border-color: color-mix(in srgb, var(--text-muted) 40%, var(--border));
	}

	.execute-row-main {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 1rem;
	}

	.exec-info {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		flex: 1;
		min-width: 0;
	}

	.exec-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		line-height: 1.4;
	}

	.exec-suite {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.exec-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	.exec-btn {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg);
		cursor: pointer;
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background var(--duration-fast),
			border-color var(--duration-fast),
			color var(--duration-fast);
	}

	.exec-btn.pass:hover {
		background: var(--pass-soft);
		border-color: var(--pass);
		color: var(--pass);
	}
	.exec-btn.fail:hover {
		background: var(--fail-soft);
		border-color: var(--fail);
		color: var(--fail);
	}
	.exec-btn.warn:hover {
		background: var(--warn-soft);
		border-color: var(--warn);
		color: var(--warn);
	}
	.exec-btn.muted:hover {
		background: var(--bg-subtle);
		border-color: var(--text-muted);
		color: var(--text-muted);
	}

	.exec-reset {
		font-size: 0.875rem;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		transition: color var(--duration-fast);
	}

	.exec-reset:hover {
		color: var(--text);
	}

	.result-chip {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.6rem;
		border-radius: 100px;
	}

	.result-chip.pass {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.result-chip.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.result-chip.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.result-chip.muted {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
	.result-chip.pending {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}

	/* ── Steps in execute view ── */
	.exec-steps {
		border-top: 1px solid var(--border);
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--bg-subtle);
	}

	.exec-step {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	.exec-step-num {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
		width: 20px;
		flex-shrink: 0;
		padding-top: 0.1rem;
	}

	.exec-step-body {
		flex: 1;
	}

	.exec-step-action {
		font-size: 0.8125rem;
		color: var(--text);
		line-height: 1.4;
	}

	.exec-step-data,
	.exec-step-expected {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		margin-top: 0.2rem;
	}

	/* ── Shared chips ── */
	.id-chip {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 4px;
		letter-spacing: 0.02em;
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		flex-shrink: 0;
	}

	.id-chip.small {
		font-size: 0.63rem;
	}

	.priority-badge {
		font-size: 0.65rem;
		font-weight: 500;
		border-radius: 100px;
		padding: 0.12rem 0.45rem;
		flex-shrink: 0;
	}

	.priority-badge.small {
		font-size: 0.6rem;
	}
	.priority-badge.critical {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.priority-badge.high {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.priority-badge.medium {
		background: var(--node-soft);
		color: var(--node);
	}
	.priority-badge.low {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
		flex-shrink: 0;
	}

	.icon-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}
	.icon-btn.danger:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}

	@media (max-width: 768px) {
		.builder-workspace {
			grid-template-columns: 1fr;
		}

		.right-panel {
			display: none;
		}
	}
</style>
