<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { fetchSuites, createSuite, deleteSuite, searchRepository } from '$lib/api/repository';
	import { fetchRuns, createRun, duplicateRun, deleteRun } from '$lib/api/repository';
	import { runsVersion } from '$lib/stores/runner';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import { REPO_PAGE_SIZE } from '$lib/constants';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { TOAST_TIMEOUT_MS } from '$lib/constants';
	import {
		CLEAR_SEARCH_LABEL,
		CANCEL_LABEL,
		SEARCHING_LABEL,
		LOADING_LABEL,
		SORT_BY_LABEL
	} from '$lib/copy/common';
	import {
		TEST_REPOSITORY_BREADCRUMB,
		NAME_LABEL,
		DESCRIPTION_LABEL,
		PRIORITY_LABEL,
		TITLE_LABEL,
		NAME_REQUIRED_ERROR,
		TITLE_REQUIRED_ERROR,
		PAGE_TITLE,
		HEADING,
		HEADER_DESC,
		NEW_SUITE_LABEL,
		NEW_RUN_LABEL,
		SUITES_TAB_LABEL,
		RUNS_TAB_LABEL,
		SEARCH_PLACEHOLDER,
		NO_RESULTS_TITLE,
		CASES_LABEL,
		SUITES_LABEL,
		RUNS_LABEL,
		AUTOMATED_TAG_LABEL,
		DELETE_SUITE_TITLE,
		DELETE_RUN_TITLE,
		DUPLICATE_RUN_ACTION_TITLE,
		NO_SUITES_YET_TITLE,
		NO_SUITES_YET_DESC,
		NO_RUNS_YET_TITLE,
		NO_RUNS_YET_DESC,
		NEW_SUITE_MODAL_TITLE,
		NEW_RUN_MODAL_TITLE,
		SUITE_NAME_PLACEHOLDER,
		SUITE_DESC_PLACEHOLDER,
		RUN_TITLE_PLACEHOLDER,
		DUPLICATE_RUN_MODAL_TITLE,
		DUPLICATE_LABEL,
		DUPLICATE_CONFIRM_SUFFIX,
		FAILED_TO_LOAD_DATA,
		FAILED_TO_DELETE_SUITE,
		FAILED_TO_DUPLICATE_RUN,
		FAILED_TO_DELETE_RUN,
		noResultsDescription,
		createdByLabel,
		caseCount,
		createSuiteLabel,
		createRunLabel,
		deleteEntityTitle,
		suiteCreatedToast,
		suiteDeletedToast,
		duplicatedAsToast,
		runDeletedToast
	} from '$lib/copy/repository';

	/** @type {'suites' | 'runs'} */
	let tab =
		(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('plum:repo:tab')) || 'suites';

	function setTab(t) {
		tab = t;
		try {
			sessionStorage.setItem('plum:repo:tab', t);
		} catch {}
	}

	function readSort(key, fallback) {
		try {
			const v = sessionStorage.getItem(key);
			if (v) return JSON.parse(v);
		} catch {}
		return fallback;
	}

	function writeSort(key, sort) {
		try {
			sessionStorage.setItem(key, JSON.stringify(sort));
		} catch {}
	}

	let suites = [];
	let suitesTotal = 0;
	let suitesPage = 1;
	let suitesSort = readSort('plum:repo:suites:sort', { by: 'createdAt', order: 'desc' });

	let runs = [];
	let runsTotal = 0;
	let runsPage = 1;
	let runsSort = readSort('plum:repo:runs:sort', { by: 'createdAt', order: 'desc' });

	const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

	function sortByPriority(items, order) {
		return [...items].sort((a, b) => {
			const diff = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
			return order === 'asc' ? diff : -diff;
		});
	}

	let loading = true;
	let toast = null;

	// Search results (server-side when query is active)
	let searchResults = null;
	let searchLoading = false;
	let searchTimer = null;

	let suiteModalOpen = false;
	let suiteForm = { name: '', description: '', priority: 'Medium' };
	let suiteFormSaving = false;
	let suiteFormError = '';

	let runModalOpen = false;
	let runForm = { title: '' };
	let runFormSaving = false;
	let runFormError = '';

	let confirmDelete = null;
	let confirmDeleteOpen = false;

	let confirmDuplicate = null;
	let confirmDuplicateOpen = false;

	let search = '';

	$: q = search.trim();

	$: {
		clearTimeout(searchTimer);
		if (q) {
			searchLoading = true;
			searchResults = null;
			searchTimer = setTimeout(async () => {
				try {
					searchResults = await searchRepository(q);
				} catch {
					searchResults = { suites: [], cases: [], runs: [] };
				} finally {
					searchLoading = false;
				}
			}, 300);
		} else {
			searchResults = null;
			searchLoading = false;
		}
	}

	$: filteredCases = searchResults?.cases ?? [];
	$: filteredSuites = searchResults?.suites ?? [];
	$: filteredRuns = searchResults?.runs ?? [];

	const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	async function loadSuites(page = 1) {
		const isPrioritySort = suitesSort.by === 'priority';
		const result = await fetchSuites({
			page,
			sortBy: isPrioritySort ? 'createdAt' : suitesSort.by,
			sortOrder: suitesSort.order
		});
		suites = isPrioritySort ? sortByPriority(result.suites, suitesSort.order) : result.suites;
		suitesTotal = result.total;
		suitesPage = page;
	}

	async function loadRuns(page = 1) {
		const result = await fetchRuns({ page, sortBy: runsSort.by, sortOrder: runsSort.order });
		runs = result.runs;
		runsTotal = result.total;
		runsPage = page;
	}

	async function applySuitesSort(by) {
		if (suitesSort.by === by) {
			suitesSort.order = suitesSort.order === 'asc' ? 'desc' : 'asc';
		} else {
			suitesSort = { by, order: by === 'createdAt' ? 'desc' : 'asc' };
		}
		writeSort('plum:repo:suites:sort', suitesSort);
		await loadSuites(1);
	}

	async function applyRunsSort(by) {
		if (runsSort.by === by) {
			runsSort.order = runsSort.order === 'asc' ? 'desc' : 'asc';
		} else {
			runsSort = { by, order: by === 'createdAt' || by === 'updatedAt' ? 'desc' : 'asc' };
		}
		writeSort('plum:repo:runs:sort', runsSort);
		await loadRuns(1);
	}

	onMount(async () => {
		try {
			await Promise.all([loadSuites(1), loadRuns(1)]);
		} catch (e) {
			showToast('error', FAILED_TO_LOAD_DATA);
		} finally {
			loading = false;
		}
	});

	async function handleCreateSuite() {
		if (!suiteForm.name.trim()) {
			suiteFormError = NAME_REQUIRED_ERROR;
			return;
		}
		suiteFormError = '';
		suiteFormSaving = true;
		try {
			const suite = await createSuite(suiteForm);
			suites = [...suites, suite];
			suitesTotal += 1;
			suiteModalOpen = false;
			suiteForm = { name: '', description: '', priority: 'Medium' };
			showToast('success', suiteCreatedToast(suite.name));
		} catch (e) {
			suiteFormError = e.message;
		} finally {
			suiteFormSaving = false;
		}
	}

	async function handleDeleteSuite(id, name) {
		try {
			await deleteSuite(id);
			suites = suites.filter((s) => s.id !== id);
			suitesTotal -= 1;
			showToast('success', suiteDeletedToast(name));
		} catch {
			showToast('error', FAILED_TO_DELETE_SUITE);
		}
		confirmDelete = null;
		confirmDeleteOpen = false;
	}

	async function handleCreateRun() {
		if (!runForm.title.trim()) {
			runFormError = TITLE_REQUIRED_ERROR;
			return;
		}
		runFormError = '';
		runFormSaving = true;
		try {
			const run = await createRun({ title: runForm.title, caseIds: [] });
			runs = [run, ...runs];
			runModalOpen = false;
			runForm = { title: '' };
			window.location.href = `/test-repository/runs/${run.id}`;
		} catch (e) {
			runFormError = e.message;
		} finally {
			runFormSaving = false;
		}
	}

	async function handleDuplicateRun(run) {
		confirmDuplicate = run;
		confirmDuplicateOpen = true;
	}

	async function executeDuplicate() {
		if (!confirmDuplicate) return;
		const run = confirmDuplicate;
		confirmDuplicate = null;
		confirmDuplicateOpen = false;
		try {
			const copy = await duplicateRun(run.id);
			runs = [copy, ...runs];
			runsTotal += 1;
			runsVersion.update((v) => v + 1);
			showToast('success', duplicatedAsToast(copy.title));
		} catch {
			showToast('error', FAILED_TO_DUPLICATE_RUN);
		}
	}

	async function handleDeleteRun(id, title) {
		try {
			await deleteRun(id);
			runs = runs.filter((r) => r.id !== id);
			runsTotal -= 1;
			runsVersion.update((v) => v + 1);
			showToast('success', runDeletedToast(title));
		} catch {
			showToast('error', FAILED_TO_DELETE_RUN);
		}
		confirmDelete = null;
		confirmDeleteOpen = false;
	}

	function priorityClass(p) {
		return p?.toLowerCase() ?? 'medium';
	}

	function runStatusClass(s) {
		return s === 'complete' ? 'pass' : s === 'in-progress' ? 'warn' : 'muted';
	}
</script>

<svelte:head><title>{PAGE_TITLE}</title></svelte:head>

<Toast {toast} />

<ConfirmModal
	bind:open={confirmDeleteOpen}
	title={deleteEntityTitle(confirmDelete?.type)}
	on:confirm={() =>
		confirmDelete?.type === 'suite'
			? handleDeleteSuite(confirmDelete.id, confirmDelete.name)
			: handleDeleteRun(confirmDelete.id, confirmDelete.name)}
>
	{#if confirmDelete}
		Delete <strong>"{confirmDelete.name}"</strong>? This cannot be undone.
	{/if}
</ConfirmModal>

<ConfirmModal
	bind:open={confirmDuplicateOpen}
	title={DUPLICATE_RUN_MODAL_TITLE}
	confirmLabel={DUPLICATE_LABEL}
	on:confirm={executeDuplicate}
>
	{#if confirmDuplicate}
		{DUPLICATE_LABEL} <strong>"{confirmDuplicate.title}"</strong>{DUPLICATE_CONFIRM_SUFFIX}
	{/if}
</ConfirmModal>

<Modal bind:open={suiteModalOpen} title={NEW_SUITE_MODAL_TITLE}>
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="suite-name">{NAME_LABEL}</label>
			<input
				id="suite-name"
				type="text"
				class="field-input"
				bind:value={suiteForm.name}
				placeholder={SUITE_NAME_PLACEHOLDER}
			/>
		</div>
		<div class="field">
			<label class="field-label" for="suite-desc">{DESCRIPTION_LABEL}</label>
			<textarea
				id="suite-desc"
				class="field-input field-textarea"
				bind:value={suiteForm.description}
				placeholder={SUITE_DESC_PLACEHOLDER}
				rows="3"
			></textarea>
		</div>
		<div class="field">
			<label class="field-label" for="suite-prio">{PRIORITY_LABEL}</label>
			<select id="suite-prio" class="field-input" bind:value={suiteForm.priority}>
				{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		{#if suiteFormError}<p class="form-error">{suiteFormError}</p>{/if}
		<div class="modal-actions">
			<Button on:click={handleCreateSuite} disabled={suiteFormSaving}>
				{createSuiteLabel(suiteFormSaving)}
			</Button>
			<Button
				variant="ghost"
				on:click={() => {
					suiteModalOpen = false;
					suiteFormError = '';
				}}>{CANCEL_LABEL}</Button
			>
		</div>
	</div>
</Modal>

<Modal bind:open={runModalOpen} title={NEW_RUN_MODAL_TITLE}>
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="run-title">{TITLE_LABEL}</label>
			<input
				id="run-title"
				type="text"
				class="field-input"
				bind:value={runForm.title}
				placeholder={RUN_TITLE_PLACEHOLDER}
			/>
		</div>
		{#if runFormError}<p class="form-error">{runFormError}</p>{/if}
		<div class="modal-actions">
			<Button on:click={handleCreateRun} disabled={runFormSaving}>
				{createRunLabel(runFormSaving)}
			</Button>
			<Button
				variant="ghost"
				on:click={() => {
					runModalOpen = false;
					runFormError = '';
				}}>{CANCEL_LABEL}</Button
			>
		</div>
	</div>
</Modal>

<div class="page-header">
	<div class="header-text">
		<h1>{HEADING}</h1>
		<p class="header-desc">{HEADER_DESC}</p>
	</div>
	<div class="header-actions">
		{#if tab === 'suites'}
			<Button on:click={() => (suiteModalOpen = true)}>{NEW_SUITE_LABEL}</Button>
		{:else}
			<Button on:click={() => (runModalOpen = true)}>{NEW_RUN_LABEL}</Button>
		{/if}
	</div>
</div>

<div class="tabs">
	<button class="tab" class:active={tab === 'suites'} on:click={() => setTab('suites')}>
		{SUITES_TAB_LABEL}
		<span class="tab-count">{q ? filteredSuites.length + '/' : ''}{suitesTotal}</span>
	</button>
	<button class="tab" class:active={tab === 'runs'} on:click={() => setTab('runs')}>
		{RUNS_TAB_LABEL}
		<span class="tab-count">{q ? filteredRuns.length + '/' : ''}{runsTotal}</span>
	</button>
</div>

<div class="search-bar">
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
	<input type="search" class="search-input" placeholder={SEARCH_PLACEHOLDER} bind:value={search} />
	{#if search}
		<button class="search-clear" on:click={() => (search = '')} aria-label={CLEAR_SEARCH_LABEL}>
			<svg
				width="12"
				height="12"
				viewBox="0 0 14 14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg
			>
		</button>
	{/if}
</div>

{#if !q}
	<div class="sort-bar">
		<span class="sort-label">{SORT_BY_LABEL}</span>
		{#if tab === 'suites'}
			{#each [['createdAt', 'Date Created'], ['displayId', 'ID'], ['name', 'Name'], ['priority', 'Priority']] as [val, label]}
				<button
					class="sort-chip"
					class:active={suitesSort.by === val}
					on:click={() => applySuitesSort(val)}
				>
					{label}
					{#if suitesSort.by === val}
						<span class="sort-dir">{suitesSort.order === 'asc' ? '↑' : '↓'}</span>
					{/if}
				</button>
			{/each}
		{:else}
			{#each [['createdAt', 'Date Created'], ['updatedAt', 'Last Updated'], ['title', 'Name']] as [val, label]}
				<button
					class="sort-chip"
					class:active={runsSort.by === val}
					on:click={() => applyRunsSort(val)}
				>
					{label}
					{#if runsSort.by === val}
						<span class="sort-dir">{runsSort.order === 'asc' ? '↑' : '↓'}</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
{/if}

{#if q}
	<!-- ── Global search results ── -->
	<div transition:fly={{ y: 4, duration: 160 }}>
		{#if searchLoading}
			<div class="loading-row">{SEARCHING_LABEL}</div>
		{:else if !searchResults}
			<div class="loading-row">{SEARCHING_LABEL}</div>
		{:else if filteredCases.length === 0 && filteredSuites.length === 0 && filteredRuns.length === 0}
			<EmptyState title={NO_RESULTS_TITLE} description={noResultsDescription(search)} />
		{:else}
			{#if filteredCases.length > 0}
				<div class="search-section">
					<h2 class="search-section-title">
						{CASES_LABEL} <span class="tab-count">{filteredCases.length}</span>
					</h2>
					<div class="case-results">
						{#each filteredCases as tc (tc.id)}
							<a href="/test-repository/suites/{tc.suite.id}" class="case-result-row">
								<span class="id-chip small">{tc.displayId}</span>
								<span class="case-result-title">{tc.title}</span>
								{#if tc.isAutomated}<span class="auto-badge">{AUTOMATED_TAG_LABEL}</span>{/if}
								<span class="priority-badge small {priorityClass(tc.priority)}">{tc.priority}</span>
								<span class="case-result-suite">{tc.suite.displayId} · {tc.suite.name}</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			{#if filteredSuites.length > 0}
				<div class="search-section">
					<h2 class="search-section-title">
						{SUITES_LABEL} <span class="tab-count">{filteredSuites.length}</span>
					</h2>
					<div class="suite-grid">
						{#each filteredSuites as suite (suite.id)}
							<div class="suite-card">
								<a
									href="/test-repository/suites/{suite.id}"
									class="card-link"
									aria-label={suite.name}
								></a>
								<div class="suite-card-header">
									<span class="id-chip">{suite.displayId}</span>
									<span class="priority-badge {priorityClass(suite.priority)}"
										>{suite.priority}</span
									>
									<div class="suite-card-actions">
										<button
											class="icon-btn danger"
											title={DELETE_SUITE_TITLE}
											on:click={() => {
												confirmDelete = {
													type: 'suite',
													id: suite.id,
													name: suite.name
												};
												confirmDeleteOpen = true;
											}}
										>
											<svg
												width="13"
												height="13"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<polyline points="3 6 5 6 21 6" /><path
													d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
												/><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
											</svg>
										</button>
									</div>
								</div>
								<h3 class="suite-name">{suite.name}</h3>
								{#if suite.description}
									<p class="suite-desc">{suite.description}</p>
								{/if}
								<div class="suite-meta">
									<span class="meta-item">
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											><path
												d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
											/></svg
										>
										{caseCount(suite._count.cases)}
									</span>
									<span class="meta-item">{createdByLabel(suite.createdBy.name)}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if filteredRuns.length > 0}
				<div class="search-section">
					<h2 class="search-section-title">
						Runs <span class="tab-count">{filteredRuns.length}</span>
					</h2>
					<div class="runs-list">
						{#each filteredRuns as run (run.id)}
							<div class="run-row">
								<a href="/test-repository/runs/{run.id}" class="card-link" aria-label={run.title}
								></a>
								<div class="run-row-main">
									<span class="run-status-dot {runStatusClass(run.status)}"></span>
									<span class="run-title">{run.title}</span>
									<span class="run-count">{caseCount(run._count.entries)}</span>
								</div>
								<div class="run-meta">
									<span class="run-status-label">{run.status}</span>
									<span class="meta-sep">·</span>
									<span>{createdByLabel(run.createdBy.name)}</span>
									<span class="meta-sep">·</span>
									<span>{new Date(run.createdAt).toLocaleDateString()}</span>
								</div>
								<div class="run-row-actions">
									<button
										class="icon-btn"
										title={DUPLICATE_RUN_ACTION_TITLE}
										on:click={() => handleDuplicateRun(run)}
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<rect x="9" y="9" width="13" height="13" rx="2" /><path
												d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
											/>
										</svg>
									</button>
									<button
										class="icon-btn danger"
										title={DELETE_RUN_TITLE}
										on:click={() => {
											confirmDelete = { type: 'run', id: run.id, name: run.title };
											confirmDeleteOpen = true;
										}}
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="3 6 5 6 21 6" /><path
												d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
											/><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
{:else if tab === 'suites'}
	<div transition:fly={{ y: 4, duration: 160 }}>
		{#if loading}
			<div class="loading-row">{LOADING_LABEL}</div>
		{:else if suites.length === 0}
			<EmptyState title={NO_SUITES_YET_TITLE} description={NO_SUITES_YET_DESC} />
		{:else}
			<div class="suite-grid">
				{#each suites as suite (suite.id)}
					<div class="suite-card">
						<a href="/test-repository/suites/{suite.id}" class="card-link" aria-label={suite.name}
						></a>
						<div class="suite-card-header">
							<span class="id-chip">{suite.displayId}</span>
							<span class="priority-badge {priorityClass(suite.priority)}">{suite.priority}</span>
							<div class="suite-card-actions">
								<button
									class="icon-btn danger"
									title={DELETE_SUITE_TITLE}
									on:click={() => {
										confirmDelete = { type: 'suite', id: suite.id, name: suite.name };
										confirmDeleteOpen = true;
									}}
								>
									<svg
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="3 6 5 6 21 6" /><path
											d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
										/><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
									</svg>
								</button>
							</div>
						</div>
						<h3 class="suite-name">{suite.name}</h3>
						{#if suite.description}
							<p class="suite-desc">{suite.description}</p>
						{/if}
						<div class="suite-meta">
							<span class="meta-item">
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									><path
										d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
									/></svg
								>
								{caseCount(suite._count.cases)}
							</span>
							<span class="meta-item">{createdByLabel(suite.createdBy.name)}</span>
						</div>
					</div>
				{/each}
			</div>
			{#if Math.ceil(suitesTotal / REPO_PAGE_SIZE) > 1}
				<div class="pagination-row">
					<Pagination
						current={suitesPage}
						total={Math.ceil(suitesTotal / REPO_PAGE_SIZE)}
						on:change={(e) => loadSuites(e.detail)}
					/>
				</div>
			{/if}
		{/if}
	</div>
{:else}
	<div transition:fly={{ y: 4, duration: 160 }}>
		{#if loading}
			<div class="loading-row">{LOADING_LABEL}</div>
		{:else if runs.length === 0}
			<EmptyState title={NO_RUNS_YET_TITLE} description={NO_RUNS_YET_DESC} />
		{:else}
			<div class="runs-list">
				{#each runs as run (run.id)}
					<div class="run-row">
						<a href="/test-repository/runs/{run.id}" class="card-link" aria-label={run.title}></a>
						<div class="run-row-main">
							<span class="run-status-dot {runStatusClass(run.status)}"></span>
							<span class="run-title">{run.title}</span>
							<span class="run-count">{caseCount(run._count.entries)}</span>
						</div>
						<div class="run-meta">
							<span class="run-status-label">{run.status}</span>
							<span class="meta-sep">·</span>
							<span>{createdByLabel(run.createdBy.name)}</span>
							<span class="meta-sep">·</span>
							<span>{new Date(run.createdAt).toLocaleDateString()}</span>
						</div>
						<div class="run-row-actions">
							<button
								class="icon-btn"
								title={DUPLICATE_RUN_ACTION_TITLE}
								on:click={() => handleDuplicateRun(run)}
							>
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="9" y="9" width="13" height="13" rx="2" /><path
										d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
									/>
								</svg>
							</button>
							<button
								class="icon-btn danger"
								title={DELETE_RUN_TITLE}
								on:click={() => {
									confirmDelete = { type: 'run', id: run.id, name: run.title };
									confirmDeleteOpen = true;
								}}
							>
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="3 6 5 6 21 6" /><path
										d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
									/><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
			{#if Math.ceil(runsTotal / REPO_PAGE_SIZE) > 1}
				<div class="pagination-row">
					<Pagination
						current={runsPage}
						total={Math.ceil(runsTotal / REPO_PAGE_SIZE)}
						on:change={(e) => loadRuns(e.detail)}
					/>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.header-text h1 {
		font-size: 2.5rem;
		margin-bottom: 0.25rem;
	}

	.header-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.header-actions {
		flex-shrink: 0;
		padding-top: 0.25rem;
	}

	/* ── Tabs ── */
	.tabs {
		display: flex;
		gap: 0.125rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem 0.625rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast);
		margin-bottom: -1px;
	}

	.tab:hover {
		color: var(--text);
	}

	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
		font-weight: 500;
	}

	.tab-count {
		font-size: 0.7rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.05rem 0.4rem;
		color: var(--text-muted);
	}

	.loading-row {
		font-size: 0.875rem;
		color: var(--text-muted);
		padding: 2rem 0;
	}

	.pagination-row {
		margin-top: 1.5rem;
	}

	/* ── Search ── */
	.search-bar {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		color: var(--text-muted);
		pointer-events: none;
		flex-shrink: 0;
	}

	.search-input {
		width: 100%;
		max-width: 360px;
		height: 34px;
		padding: 0 2rem 0 2.25rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		color: var(--text);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		outline: none;
		transition: border-color var(--duration-fast);
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}
	.search-input:focus {
		border-color: var(--accent);
	}
	.search-input::-webkit-search-cancel-button {
		display: none;
	}

	.search-clear {
		position: absolute;
		left: calc(360px - 1.75rem);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 0;
	}

	.search-clear:hover {
		color: var(--text);
	}

	/* ── Sort bar ── */
	.sort-bar {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.sort-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-right: 0.25rem;
	}

	.sort-chip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		height: 28px;
		padding: 0 0.625rem;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast),
			background var(--duration-fast);
	}

	.sort-chip:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.sort-chip.active {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.sort-dir {
		font-size: 0.7rem;
		opacity: 0.8;
	}

	/* ── Search results ── */
	.search-section {
		margin-bottom: 2rem;
	}

	.search-section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
	}

	.case-results {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.case-result-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.6rem 0.875rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: inherit;
		transition: border-color var(--duration-fast);
	}

	.case-result-row:hover {
		border-color: var(--accent);
	}

	.case-result-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.case-result-suite {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}

	/* ── Suite grid ── */
	.suite-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.875rem;
	}

	.card-link {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		z-index: 0;
	}

	.suite-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-top: 3px solid var(--accent);
		border-radius: var(--radius-md);
		padding: 1rem;
		color: inherit;
		transition:
			border-color var(--duration-fast),
			box-shadow var(--duration-fast);
	}

	.suite-card:hover {
		border-color: var(--accent);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	.suite-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.suite-card-actions {
		position: relative;
		z-index: 1;
		margin-left: auto;
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	.suite-card:hover .suite-card-actions {
		opacity: 1;
	}

	.suite-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
	}

	.suite-desc {
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.suite-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* ── ID chip ── */
	.id-chip {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		letter-spacing: 0.02em;
		flex-shrink: 0;
	}

	.id-chip.small {
		font-size: 0.65rem;
	}

	.auto-badge {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--pass);
		background: var(--pass-soft);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.4rem;
		flex-shrink: 0;
	}

	/* ── Priority badges ── */
	.priority-badge {
		font-size: 0.68rem;
		font-weight: 500;
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.5rem;
		flex-shrink: 0;
	}

	.priority-badge.small {
		font-size: 0.62rem;
		padding: 0.1rem 0.4rem;
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

	/* ── Icon button ── */
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
	}

	.icon-btn.danger:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}

	/* ── Runs list ── */
	.runs-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.run-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.875rem 1rem;
		color: inherit;
		transition: border-color var(--duration-fast);
	}

	.run-row:hover {
		border-color: var(--accent);
	}

	.run-row-main {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex: 1;
		min-width: 0;
	}

	.run-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.run-status-dot.pass {
		background: var(--pass);
	}
	.run-status-dot.warn {
		background: var(--warn);
	}
	.run-status-dot.muted {
		background: var(--border);
	}

	.run-title {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.run-count {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.run-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.run-status-label {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: capitalize;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.4rem;
	}

	.meta-sep {
		color: var(--border);
	}

	.run-row-actions {
		position: relative;
		z-index: 1;
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	.run-row:hover .run-row-actions {
		opacity: 1;
	}

	/* ── Form helpers ── */
	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field-textarea {
		height: auto;
		resize: vertical;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.25rem;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
			gap: 0.75rem;
		}

		.suite-grid {
			grid-template-columns: 1fr;
		}

		.run-meta {
			display: none;
		}
	}
</style>
