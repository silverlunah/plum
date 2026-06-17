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
	import { fly } from 'svelte/transition';
	import { fetchSuites, createSuite, deleteSuite } from '$lib/api/repository';
	import { fetchRuns, createRun, duplicateRun, deleteRun } from '$lib/api/repository';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { TOAST_TIMEOUT_MS } from '$lib/constants';

	/** @type {'suites' | 'runs'} */
	let tab = 'suites';

	let suites = [];
	let runs = [];
	let loading = true;
	let toast = null;

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

	let search = '';

	$: q = search.trim().toLowerCase();
	$: filteredSuites = q
		? suites.filter(
				(s) => s.displayId.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
			)
		: suites;
	$: filteredRuns = q ? runs.filter((r) => r.title.toLowerCase().includes(q)) : runs;

	const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	onMount(async () => {
		try {
			[suites, runs] = await Promise.all([fetchSuites(), fetchRuns()]);
		} catch (e) {
			showToast('error', 'Failed to load data');
		} finally {
			loading = false;
		}
	});

	async function handleCreateSuite() {
		if (!suiteForm.name.trim()) {
			suiteFormError = 'Name is required.';
			return;
		}
		suiteFormError = '';
		suiteFormSaving = true;
		try {
			const suite = await createSuite(suiteForm);
			suites = [...suites, suite];
			suiteModalOpen = false;
			suiteForm = { name: '', description: '', priority: 'Medium' };
			showToast('success', `Suite "${suite.name}" created.`);
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
			showToast('success', `Suite "${name}" deleted.`);
		} catch {
			showToast('error', 'Failed to delete suite.');
		}
		confirmDelete = null;
		confirmDeleteOpen = false;
	}

	async function handleCreateRun() {
		if (!runForm.title.trim()) {
			runFormError = 'Title is required.';
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
		try {
			const copy = await duplicateRun(run.id);
			runs = [copy, ...runs];
			showToast('success', `Duplicated as "${copy.title}".`);
		} catch {
			showToast('error', 'Failed to duplicate run.');
		}
	}

	async function handleDeleteRun(id, title) {
		try {
			await deleteRun(id);
			runs = runs.filter((r) => r.id !== id);
			showToast('success', `Run "${title}" deleted.`);
		} catch {
			showToast('error', 'Failed to delete run.');
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

<svelte:head><title>Test Repository — Plum</title></svelte:head>

<Toast {toast} />

<ConfirmModal
	bind:open={confirmDeleteOpen}
	title="Delete {confirmDelete?.type === 'suite' ? 'Suite' : 'Run'}"
	confirmLabel="Delete"
	on:confirm={() =>
		confirmDelete?.type === 'suite'
			? handleDeleteSuite(confirmDelete.id, confirmDelete.name)
			: handleDeleteRun(confirmDelete.id, confirmDelete.name)}
>
	{#if confirmDelete}
		Delete <strong>"{confirmDelete.name}"</strong>? This cannot be undone.
	{/if}
</ConfirmModal>

<Modal bind:open={suiteModalOpen} title="New Test Suite">
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="suite-name">Name</label>
			<input
				id="suite-name"
				type="text"
				class="field-input"
				bind:value={suiteForm.name}
				placeholder="Login flows"
			/>
		</div>
		<div class="field">
			<label class="field-label" for="suite-desc">Description</label>
			<textarea
				id="suite-desc"
				class="field-input field-textarea"
				bind:value={suiteForm.description}
				placeholder="What this suite covers…"
				rows="3"
			></textarea>
		</div>
		<div class="field">
			<label class="field-label" for="suite-prio">Priority</label>
			<select id="suite-prio" class="field-input" bind:value={suiteForm.priority}>
				{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		{#if suiteFormError}<p class="form-error">{suiteFormError}</p>{/if}
		<div class="modal-actions">
			<Button on:click={handleCreateSuite} disabled={suiteFormSaving}>
				{suiteFormSaving ? 'Creating…' : 'Create Suite'}
			</Button>
			<Button
				variant="ghost"
				on:click={() => {
					suiteModalOpen = false;
					suiteFormError = '';
				}}>Cancel</Button
			>
		</div>
	</div>
</Modal>

<Modal bind:open={runModalOpen} title="New Test Run">
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="run-title">Title</label>
			<input
				id="run-title"
				type="text"
				class="field-input"
				bind:value={runForm.title}
				placeholder="Sprint 12 regression"
			/>
		</div>
		{#if runFormError}<p class="form-error">{runFormError}</p>{/if}
		<div class="modal-actions">
			<Button on:click={handleCreateRun} disabled={runFormSaving}>
				{runFormSaving ? 'Creating…' : 'Create Run'}
			</Button>
			<Button
				variant="ghost"
				on:click={() => {
					runModalOpen = false;
					runFormError = '';
				}}>Cancel</Button
			>
		</div>
	</div>
</Modal>

<div class="page-header">
	<div class="header-text">
		<h1>Test Repository</h1>
		<p class="header-desc">Manage test suites, cases, and track manual test runs.</p>
	</div>
	<div class="header-actions">
		{#if tab === 'suites'}
			<Button on:click={() => (suiteModalOpen = true)}>+ New Suite</Button>
		{:else}
			<Button on:click={() => (runModalOpen = true)}>+ New Run</Button>
		{/if}
	</div>
</div>

<div class="tabs">
	<button class="tab" class:active={tab === 'suites'} on:click={() => (tab = 'suites')}>
		Suites
		<span class="tab-count">{q ? filteredSuites.length + '/' : ''}{suites.length}</span>
	</button>
	<button class="tab" class:active={tab === 'runs'} on:click={() => (tab = 'runs')}>
		Test Runs
		<span class="tab-count">{q ? filteredRuns.length + '/' : ''}{runs.length}</span>
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
	<input
		type="search"
		class="search-input"
		placeholder="Search by ID or name…"
		bind:value={search}
	/>
	{#if search}
		<button class="search-clear" on:click={() => (search = '')} aria-label="Clear search">
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

{#if tab === 'suites'}
	<div transition:fly={{ y: 4, duration: 160 }}>
		{#if loading}
			<div class="loading-row">Loading…</div>
		{:else if suites.length === 0}
			<EmptyState
				title="No test suites yet"
				description="Create your first suite to start organising test cases."
			/>
		{:else if filteredSuites.length === 0}
			<EmptyState title="No results" description="No suites match &ldquo;{search}&rdquo;." />
		{:else}
			<div class="suite-grid">
				{#each filteredSuites as suite (suite.id)}
					<a href="/test-repository/suites/{suite.id}" class="suite-card">
						<div class="suite-card-header">
							<span class="id-chip">{suite.displayId}</span>
							<span class="priority-badge {priorityClass(suite.priority)}">{suite.priority}</span>
							<div class="suite-card-actions">
								<button
									class="icon-btn danger"
									title="Delete suite"
									on:click|stopPropagation={() => {
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
								{suite._count.cases} case{suite._count.cases !== 1 ? 's' : ''}
							</span>
							<span class="meta-item">by {suite.createdBy.name}</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<div transition:fly={{ y: 4, duration: 160 }}>
		{#if loading}
			<div class="loading-row">Loading…</div>
		{:else if runs.length === 0}
			<EmptyState
				title="No test runs yet"
				description="Create a test run to start executing and tracking manual tests."
			/>
		{:else if filteredRuns.length === 0}
			<EmptyState title="No results" description="No runs match &ldquo;{search}&rdquo;." />
		{:else}
			<div class="runs-list">
				{#each filteredRuns as run (run.id)}
					<a href="/test-repository/runs/{run.id}" class="run-row">
						<div class="run-row-main">
							<span class="run-status-dot {runStatusClass(run.status)}"></span>
							<span class="run-title">{run.title}</span>
							<span class="run-count"
								>{run._count.entries} case{run._count.entries !== 1 ? 's' : ''}</span
							>
						</div>
						<div class="run-meta">
							<span class="run-status-label">{run.status}</span>
							<span class="meta-sep">·</span>
							<span>by {run.createdBy.name}</span>
							<span class="meta-sep">·</span>
							<span>{new Date(run.createdAt).toLocaleDateString()}</span>
						</div>
						<div class="run-row-actions">
							<button
								class="icon-btn"
								title="Duplicate run"
								on:click|stopPropagation={() => handleDuplicateRun(run)}
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
								title="Delete run"
								on:click|stopPropagation={() => {
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
					</a>
				{/each}
			</div>
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
		border-radius: 100px;
		padding: 0.05rem 0.4rem;
		color: var(--text-muted);
	}

	.loading-row {
		font-size: 0.875rem;
		color: var(--text-muted);
		padding: 2rem 0;
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

	/* ── Suite grid ── */
	.suite-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.875rem;
	}

	.suite-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-top: 3px solid var(--accent);
		border-radius: var(--radius-md);
		padding: 1rem;
		text-decoration: none;
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

	/* ── Priority badges ── */
	.priority-badge {
		font-size: 0.68rem;
		font-weight: 500;
		border-radius: 100px;
		padding: 0.15rem 0.5rem;
		flex-shrink: 0;
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
		display: flex;
		align-items: center;
		gap: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.875rem 1rem;
		text-decoration: none;
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
		border-radius: 100px;
		padding: 0.1rem 0.4rem;
	}

	.meta-sep {
		color: var(--border);
	}

	.run-row-actions {
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
