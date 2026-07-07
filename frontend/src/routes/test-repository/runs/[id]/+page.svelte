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
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';
	import {
		fetchRun,
		updateRun,
		fetchAllSuitesWithCases,
		recordEntryResult,
		assignEntry,
		fetchMembers
	} from '$lib/api/repository';
	import { runsVersion } from '$lib/stores/runner';
	import { auth } from '$lib/stores/auth';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import AutomatedBadge from '$lib/components/ui/AutomatedBadge.svelte';
	import PriorityBadge from '$lib/components/ui/PriorityBadge.svelte';
	import CaseIdChip from '$lib/components/ui/CaseIdChip.svelte';
	import ResultChip from '$lib/components/ui/ResultChip.svelte';
	import { TOAST_TIMEOUT_MS, RUN_REFRESH_MS } from '$lib/constants';

	const runId = $page.params.id;

	/** @type {'build' | 'execute'} */
	let mode = 'build';

	let run = null;
	let suites = [];
	let members = [];
	let loading = true;
	let toast = null;
	let saving = false;
	let executing = false;
	let assigning = null;

	$: currentUserId = $auth?.user?.id ?? null;

	let search = '';
	let expandedSuites = new Set();

	const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

	let entriesSort = (() => {
		try {
			const v = sessionStorage.getItem('plum:run:entries:sort');
			if (v) return JSON.parse(v);
		} catch {}
		return { by: 'order', order: 'asc' };
	})();

	$: sortedEntries = (() => {
		if (!run) return [];
		const list = [...run.entries];
		const dir = entriesSort.order === 'asc' ? 1 : -1;
		if (entriesSort.by === 'name')
			return list.sort((a, b) => dir * a.case.title.localeCompare(b.case.title));
		if (entriesSort.by === 'priority')
			return list.sort(
				(a, b) =>
					dir * ((PRIORITY_ORDER[a.case.priority] ?? 99) - (PRIORITY_ORDER[b.case.priority] ?? 99))
			);
		if (entriesSort.by === 'status')
			return list.sort((a, b) => dir * a.status.localeCompare(b.status));
		if (entriesSort.by === 'suite')
			return list.sort(
				(a, b) => dir * (a.case.suite?.name ?? '').localeCompare(b.case.suite?.name ?? '')
			);
		return list.sort((a, b) => dir * (a.order - b.order));
	})();

	function applyEntriesSort(by) {
		if (entriesSort.by === by) {
			entriesSort.order = entriesSort.order === 'asc' ? 'desc' : 'asc';
		} else {
			entriesSort = { by, order: 'asc' };
		}
		try {
			sessionStorage.setItem('plum:run:entries:sort', JSON.stringify(entriesSort));
		} catch {}
	}

	let dragOver = false;
	let dragEntryId = null;
	let dragOverEntryId = null;

	let executingEntryId = null;
	let entryNote = '';
	let expandedExecEntries = new Set();

	function toggleExecSteps(entryId) {
		if (expandedExecEntries.has(entryId)) expandedExecEntries.delete(entryId);
		else expandedExecEntries.add(entryId);
		expandedExecEntries = new Set(expandedExecEntries);
	}

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	let refreshInterval = null;

	onMount(async () => {
		try {
			[run, suites, members] = await Promise.all([
				fetchRun(runId),
				fetchAllSuitesWithCases(),
				fetchMembers()
			]);
			expandedSuites = new Set(suites.map((s) => s.id));
			if (run.status === 'in-progress') mode = 'execute';
		} catch (e) {
			showToast('error', 'Failed to load data');
		} finally {
			loading = false;
		}
		refreshInterval = setInterval(async () => {
			try {
				const fresh = await fetchRun(runId);
				run = fresh;
			} catch {}
		}, RUN_REFRESH_MS);
	});

	onDestroy(() => {
		if (refreshInterval) clearInterval(refreshInterval);
	});

	async function handleAssignEntry(entryId, userId) {
		assigning = entryId;
		try {
			const updated = await assignEntry(entryId, userId || null);
			run = {
				...run,
				entries: run.entries.map((e) =>
					e.id === entryId
						? { ...e, assignedToId: updated.assignedToId, assignedTo: updated.assignedTo }
						: e
				)
			};
		} catch (e) {
			showToast('error', e.message);
		} finally {
			assigning = null;
		}
	}

	$: runCaseIds = new Set(run?.entries.map((e) => e.case.id) ?? []);

	$: filteredSuites = suites
		.map((suite) => ({
			...suite,
			_totalCases: (suite.cases ?? []).length,
			cases: (suite.cases ?? []).filter(
				(tc) =>
					!runCaseIds.has(tc.id) &&
					(!search ||
						suite.displayId.toLowerCase().includes(search.toLowerCase()) ||
						suite.name.toLowerCase().includes(search.toLowerCase()) ||
						tc.title.toLowerCase().includes(search.toLowerCase()) ||
						tc.displayId.toLowerCase().includes(search.toLowerCase()))
			)
		}))
		.filter(
			(suite) =>
				!search ||
				suite.cases.length > 0 ||
				suite.displayId.toLowerCase().includes(search.toLowerCase()) ||
				suite.name.toLowerCase().includes(search.toLowerCase())
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

	async function handleStopExecution() {
		try {
			await updateRun(runId, { status: 'backlog' });
			run = { ...run, status: 'backlog' };
			mode = 'build';
			runsVersion.update((v) => v + 1);
		} catch (e) {
			showToast('error', e.message);
		}
	}

	async function handleCompleteRun() {
		try {
			await updateRun(runId, { status: 'complete' });
			run = { ...run, status: 'complete' };
			runsVersion.update((v) => v + 1);
			showToast('success', 'Run marked as complete.');
		} catch (e) {
			showToast('error', e.message);
		}
	}

	async function handleReopenRun() {
		try {
			await updateRun(runId, { status: 'backlog' });
			run = { ...run, status: 'backlog' };
			mode = 'build';
			runsVersion.update((v) => v + 1);
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
			{:else if run.status === 'in-progress'}
				<Button variant="ghost" on:click={handleStopExecution}>Stop Execution</Button>
				<Button variant="ghost" on:click={() => (mode = 'build')}>← Edit Run</Button>
				<Button on:click={handleCompleteRun}>Mark Complete</Button>
			{:else}
				<Button variant="ghost" on:click={() => (mode = 'build')}>← Edit Run</Button>
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
					<EmptyState message="No cases in this run." size="sm" />
				{:else}
					<div class="entry-sort-bar">
						{#each [['order', 'Order'], ['name', 'Name'], ['priority', 'Priority'], ['status', 'Status'], ['suite', 'Suite']] as [val, label]}
							<button
								class="entry-sort-chip"
								class:active={entriesSort.by === val}
								on:click={() => applyEntriesSort(val)}
							>
								{label}{#if entriesSort.by === val}<span class="entry-sort-dir"
										>{entriesSort.order === 'asc' ? ' ↑' : ' ↓'}</span
									>{/if}
							</button>
						{/each}
					</div>
					<div class="entry-list" role="list">
						{#each sortedEntries as entry (entry.id)}
							<div
								class="entry-row"
								class:entry-locked={isLocked}
								role="listitem"
								draggable={!isLocked && entriesSort.by === 'order'}
								on:dragstart={isLocked || entriesSort.by !== 'order'
									? null
									: (e) => onDragStart(e, entry.id)}
								on:dragover={isLocked || entriesSort.by !== 'order'
									? null
									: (e) => onDragOver(e, entry.id)}
								on:dragleave={isLocked || entriesSort.by !== 'order'
									? null
									: () => (dragOverEntryId = null)}
								on:drop={isLocked || entriesSort.by !== 'order' ? null : (e) => onDrop(e, entry.id)}
								class:dragging={dragEntryId === entry.id}
								class:drag-over={dragOverEntryId === entry.id}
							>
								{#if !isLocked && entriesSort.by === 'order'}
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
										<CaseIdChip id={entry.case.displayId} />
										<PriorityBadge priority={entry.case.priority} />
									</div>
									<p class="entry-title">{entry.case.title}</p>
									<span class="entry-suite">{entry.case.suite?.name ?? ''}</span>
								</div>
								{#if entry.case.isAutomated}
									<AutomatedBadge />
								{:else}
									<select
										class="assignee-select"
										value={entry.assignedToId ?? ''}
										disabled={assigning === entry.id}
										on:change={(e) => handleAssignEntry(entry.id, e.target.value)}
									>
										<option value="">Unassigned</option>
										{#each members as m}
											<option value={m.id}>{m.name}</option>
										{/each}
									</select>
								{/if}
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
												<CaseIdChip id={tc.displayId} small />
												<span class="browser-case-title">{tc.title}</span>
												<PriorityBadge priority={tc.priority} small />
												{#if tc.isAutomated}
													<AutomatedBadge />
												{/if}
											</button>
										{/each}
									</div>
								{:else if expandedSuites.has(suite.id)}
									<p class="browser-empty">
										{search
											? 'No matching cases'
											: suite._totalCases === 0
												? 'No cases in this suite'
												: 'All cases added'}
									</p>
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
			{#if run.status !== 'in-progress' && !isLocked}
				<div class="exec-locked-banner">
					This run is not in progress — start execution to record results.
				</div>
			{/if}
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
								{#if entry.case.steps?.length > 0}
									<button
										class="exec-chevron"
										on:click={() => toggleExecSteps(entry.id)}
										title="Toggle steps"
									>
										<svg
											class="chevron"
											class:open={expandedExecEntries.has(entry.id)}
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"><polyline points="9 18 15 12 9 6" /></svg
										>
									</button>
								{/if}
								<CaseIdChip id={entry.case.displayId} />
								{#if entry.case.isAutomated}<AutomatedBadge />{/if}
								<div>
									<p class="exec-title">{entry.case.title}</p>
									<span class="exec-suite">{entry.case.suite?.name ?? ''}</span>
								</div>
							</div>
							<div class="exec-actions">
								{#if entry.case.isAutomated}
									<div class="exec-assignee-row">
										<AutomatedBadge />
									</div>
									<div class="exec-assignee-divider"></div>
								{:else if entry.assignedTo || (!isLocked && entry.assignedTo?.id !== currentUserId)}
									<div class="exec-assignee-row">
										{#if entry.assignedTo}
											<span class="exec-assignee-name">{entry.assignedTo.name}</span>
										{/if}
										{#if !isLocked && entry.assignedTo?.id !== currentUserId}
											<button
												class="exec-assign-me"
												on:click={() => handleAssignEntry(entry.id, currentUserId)}
												disabled={assigning === entry.id}
											>
												Assign to me
											</button>
										{/if}
									</div>
									<div class="exec-assignee-divider"></div>
								{/if}
								{#if isLocked || run.status !== 'in-progress'}
									<ResultChip status={entry.status} />
								{:else if entry.status === 'pending' || entry.status === 'in-progress'}
									<div class="exec-btns">
										<button
											class="exec-btn in-progress"
											class:active={entry.status === 'in-progress'}
											on:click={() => handleMarkEntry(entry, 'in-progress')}>In Progress</button
										>
										<button class="exec-btn pass" on:click={() => handleMarkEntry(entry, 'pass')}
											>Pass</button
										>
										<button class="exec-btn fail" on:click={() => handleMarkEntry(entry, 'fail')}
											>Fail</button
										>
										<button class="exec-btn warn" on:click={() => handleMarkEntry(entry, 'blocked')}
											>Blocked</button
										>
										<button class="exec-btn muted" on:click={() => handleMarkEntry(entry, 'skip')}
											>Skip</button
										>
									</div>
								{:else}
									<div class="exec-btns">
										<ResultChip status={entry.status} />
										<button
											class="exec-reset"
											on:click={() => handleMarkEntry(entry, 'pending')}
											title="Reset to pending">↩ Reset</button
										>
									</div>
								{/if}
							</div>
						</div>

						<!-- Step viewer for current entry -->
						{#if entry.case.steps && entry.case.steps.length > 0 && expandedExecEntries.has(entry.id)}
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
		border-radius: var(--radius-pill);
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

	.run-status-badge.in-progress {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}

	.run-status-badge.backlog {
		background: var(--bg-subtle);
		color: var(--text-muted);
		border-color: var(--border);
	}

	.locked-badge {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
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
		border-radius: var(--radius-pill);
		padding: 0.05rem 0.4rem;
		color: var(--text-muted);
	}

	/* ── Builder ── */
	.builder-workspace {
		display: grid;
		grid-template-columns: 1fr 1fr;
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
		border-radius: var(--radius-pill);
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

	.entry-sort-bar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}

	.entry-sort-chip {
		font-size: 0.75rem;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text-muted);
		cursor: pointer;
		font-family: var(--font-body);
		transition:
			background var(--duration-fast),
			border-color var(--duration-fast),
			color var(--duration-fast);
	}

	.entry-sort-chip.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}

	.entry-sort-dir {
		opacity: 0.7;
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

	.exec-locked-banner {
		font-size: 0.8125rem;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.625rem 1rem;
		margin-bottom: 1rem;
	}

	.assignee-select {
		font-size: 0.75rem;
		font-family: var(--font-body);
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.4rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.assignee-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	/* ── Suite browser ── */
	.right-panel {
		position: sticky;
		top: calc(56px + 1.5rem);
		height: calc(100vh - 56px - 3rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.suite-browser {
		flex: 1;
		min-height: 0;
		padding: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		overflow-y: auto;
	}

	.browser-suite {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
	}

	.browser-suite-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 40px;
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
		max-height: 380px;
		overflow-y: auto;
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
		border-radius: var(--radius-pill);
		overflow: hidden;
		display: flex;
	}

	.progress-fill {
		height: 100%;
		border-radius: var(--radius-pill);
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

	.exec-btns {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.exec-btn {
		height: 26px;
		padding: 0 0.6rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg);
		cursor: pointer;
		font-size: 0.75rem;
		font-family: var(--font-body);
		font-weight: 500;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		white-space: nowrap;
		transition:
			background var(--duration-fast),
			border-color var(--duration-fast),
			color var(--duration-fast);
	}

	.exec-btn.in-progress:hover,
	.exec-btn.in-progress.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
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
		height: 26px;
		padding: 0 0.6rem;
		font-size: 0.75rem;
		font-family: var(--font-body);
		color: var(--text-muted);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.exec-reset:hover {
		color: var(--text);
		border-color: var(--text-muted);
	}

	.exec-assignee-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.exec-assignee-divider {
		height: 1px;
		background: var(--border);
		margin: 0.375rem 0;
	}

	.exec-assignee-name {
		font-size: 0.75rem;
		line-height: 26px;
		color: var(--text-muted);
	}

	.exec-assign-me {
		font-size: 0.7rem;
		font-family: var(--font-body);
		color: var(--accent);
		background: none;
		border: 1px solid var(--accent);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.5rem;
		cursor: pointer;
		transition: background var(--duration-fast);
	}

	.exec-assign-me:hover {
		background: var(--accent-soft);
	}

	.exec-assign-me:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.exec-chevron {
		background: none;
		border: none;
		padding: 0.125rem;
		cursor: pointer;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		flex-shrink: 0;
		transition: color var(--duration-fast);
	}

	.exec-chevron:hover {
		color: var(--text);
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
