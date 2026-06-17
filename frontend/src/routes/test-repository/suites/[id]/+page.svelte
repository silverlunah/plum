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
	import { fly, fade } from 'svelte/transition';
	import {
		fetchSuite,
		updateSuite,
		createTestCase,
		fetchTestCase,
		updateTestCase,
		saveSteps,
		deleteTestCase
	} from '$lib/api/repository';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { TOAST_TIMEOUT_MS } from '$lib/constants';

	const suiteId = $page.params.id;

	const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

	let suite = null;
	let loading = true;
	let toast = null;

	let caseModalOpen = false;
	let caseForm = { title: '', description: '', priority: 'Medium', automatedTag: '' };
	let caseFormSaving = false;
	let caseFormError = '';

	let selectedCase = null;
	let selectedCaseLoading = false;
	let editingCase = false;
	let editCaseForm = {};
	let editCaseSaving = false;

	let editingSteps = false;
	let stepsForm = [];
	let stepsSaving = false;

	let historyTab = false;

	let confirmDeleteCase = null;
	let confirmDeleteCaseOpen = false;
	let editSuiteOpen = false;
	let editSuiteForm = {};
	let editSuiteSaving = false;

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	onMount(async () => {
		try {
			suite = await fetchSuite(suiteId);
		} catch {
			showToast('error', 'Failed to load suite');
		} finally {
			loading = false;
		}
	});

	async function handleCreateCase() {
		if (!caseForm.title.trim()) {
			caseFormError = 'Title is required.';
			return;
		}
		caseFormError = '';
		caseFormSaving = true;
		try {
			const tc = await createTestCase({ suiteId, ...caseForm });
			suite = { ...suite, cases: [...suite.cases, tc], _count: { cases: suite._count.cases + 1 } };
			caseModalOpen = false;
			caseForm = { title: '', description: '', priority: 'Medium', automatedTag: '' };
			showToast('success', `${tc.displayId} created.`);
		} catch (e) {
			caseFormError = e.message;
		} finally {
			caseFormSaving = false;
		}
	}

	async function selectCase(tc) {
		selectedCase = null;
		selectedCaseLoading = true;
		historyTab = false;
		editingCase = false;
		editingSteps = false;
		try {
			selectedCase = await fetchTestCase(tc.id);
			stepsForm = (selectedCase.steps ?? []).map((s) => ({ ...s }));
		} catch {
			showToast('error', 'Failed to load case');
		} finally {
			selectedCaseLoading = false;
		}
	}

	function startEditCase() {
		editCaseForm = {
			title: selectedCase.title,
			description: selectedCase.description,
			priority: selectedCase.priority,
			automatedTag: selectedCase.automatedTag ?? ''
		};
		editingCase = true;
	}

	async function handleUpdateCase() {
		editCaseSaving = true;
		try {
			const updated = await updateTestCase(selectedCase.id, editCaseForm);
			selectedCase = { ...selectedCase, ...updated };
			suite = {
				...suite,
				cases: suite.cases.map((c) => (c.id === selectedCase.id ? { ...c, ...updated } : c))
			};
			editingCase = false;
			showToast('success', 'Test case updated.');
		} catch (e) {
			showToast('error', e.message);
		} finally {
			editCaseSaving = false;
		}
	}

	function addStep() {
		stepsForm = [...stepsForm, { action: '', testData: '', expectedOutput: '' }];
	}

	function removeStep(i) {
		stepsForm = stepsForm.filter((_, idx) => idx !== i);
	}

	async function handleSaveSteps() {
		stepsSaving = true;
		try {
			const saved = await saveSteps(selectedCase.id, stepsForm);
			selectedCase = { ...selectedCase, steps: saved };
			stepsForm = saved.map((s) => ({ ...s }));
			editingSteps = false;
			showToast('success', 'Steps saved.');
		} catch (e) {
			showToast('error', e.message);
		} finally {
			stepsSaving = false;
		}
	}

	async function handleDeleteCase(id, displayId) {
		try {
			await deleteTestCase(id);
			suite = {
				...suite,
				cases: suite.cases.filter((c) => c.id !== id),
				_count: { cases: suite._count.cases - 1 }
			};
			if (selectedCase?.id === id) selectedCase = null;
			showToast('success', `${displayId} deleted.`);
		} catch {
			showToast('error', 'Failed to delete case.');
		}
		confirmDeleteCase = null;
		confirmDeleteCaseOpen = false;
	}

	async function handleUpdateSuite() {
		editSuiteSaving = true;
		try {
			const updated = await updateSuite(suiteId, editSuiteForm);
			suite = { ...suite, ...updated };
			editSuiteOpen = false;
			showToast('success', 'Suite updated.');
		} catch (e) {
			showToast('error', e.message);
		} finally {
			editSuiteSaving = false;
		}
	}

	function priorityClass(p) {
		return p?.toLowerCase() ?? 'medium';
	}

	function resultClass(r) {
		if (r === 'pass') return 'pass';
		if (r === 'fail') return 'fail';
		if (r === 'blocked') return 'warn';
		return 'muted';
	}
</script>

<svelte:head
	><title>{suite ? `${suite.displayId} — ${suite.name}` : 'Suite'} — Plum</title></svelte:head
>

<Toast {toast} />

<ConfirmModal
	bind:open={confirmDeleteCaseOpen}
	title="Delete Test Case"
	confirmLabel="Delete"
	on:confirm={() => handleDeleteCase(confirmDeleteCase?.id, confirmDeleteCase?.displayId)}
>
	{#if confirmDeleteCase}
		Delete <strong>{confirmDeleteCase.displayId} — {confirmDeleteCase.title}</strong>? This cannot
		be undone.
	{/if}
</ConfirmModal>

<Modal bind:open={caseModalOpen} title="New Test Case">
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="tc-title">Title</label>
			<input
				id="tc-title"
				type="text"
				class="field-input"
				bind:value={caseForm.title}
				placeholder="User can log in with valid credentials"
			/>
		</div>
		<div class="field">
			<label class="field-label" for="tc-desc">Description</label>
			<textarea
				id="tc-desc"
				class="field-input field-textarea"
				bind:value={caseForm.description}
				placeholder="What this case verifies…"
				rows="2"
			></textarea>
		</div>
		<div class="field-row">
			<div class="field">
				<label class="field-label" for="tc-prio">Priority</label>
				<select id="tc-prio" class="field-input" bind:value={caseForm.priority}>
					{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label class="field-label" for="tc-tag">
					Automated tag
					<span class="field-hint">Cucumber @tag</span>
				</label>
				<input
					id="tc-tag"
					type="text"
					class="field-input mono"
					bind:value={caseForm.automatedTag}
					placeholder="test-123"
				/>
			</div>
		</div>
		{#if caseFormError}<p class="form-error">{caseFormError}</p>{/if}
		<div class="modal-actions">
			<Button on:click={handleCreateCase} disabled={caseFormSaving}>
				{caseFormSaving ? 'Creating…' : 'Create Case'}
			</Button>
			<Button
				variant="ghost"
				on:click={() => {
					caseModalOpen = false;
					caseFormError = '';
				}}>Cancel</Button
			>
		</div>
	</div>
</Modal>

<Modal bind:open={editSuiteOpen} title="Edit Suite">
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="es-name">Name</label>
			<input id="es-name" type="text" class="field-input" bind:value={editSuiteForm.name} />
		</div>
		<div class="field">
			<label class="field-label" for="es-desc">Description</label>
			<textarea
				id="es-desc"
				class="field-input field-textarea"
				bind:value={editSuiteForm.description}
				rows="2"
			></textarea>
		</div>
		<div class="field">
			<label class="field-label" for="es-prio">Priority</label>
			<select id="es-prio" class="field-input" bind:value={editSuiteForm.priority}>
				{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		<div class="modal-actions">
			<Button on:click={handleUpdateSuite} disabled={editSuiteSaving}>
				{editSuiteSaving ? 'Saving…' : 'Save'}
			</Button>
			<Button variant="ghost" on:click={() => (editSuiteOpen = false)}>Cancel</Button>
		</div>
	</div>
</Modal>

{#if loading}
	<div class="loading-state">Loading…</div>
{:else if suite}
	<div class="breadcrumb">
		<a href="/test-repository" class="bc-link">Test Repository</a>
		<span class="bc-sep">›</span>
		<span class="bc-current">{suite.displayId} — {suite.name}</span>
	</div>

	<div class="suite-header">
		<div class="suite-title-row">
			<span class="id-chip large">{suite.displayId}</span>
			<span class="priority-badge {priorityClass(suite.priority)}">{suite.priority}</span>
			<h1 class="suite-title">{suite.name}</h1>
			<button
				class="icon-btn"
				title="Edit suite"
				on:click={() => {
					editSuiteForm = {
						name: suite.name,
						description: suite.description,
						priority: suite.priority
					};
					editSuiteOpen = true;
				}}
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
					><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path
						d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
					/></svg
				>
			</button>
		</div>
		{#if suite.description}
			<p class="suite-desc">{suite.description}</p>
		{/if}
		<div class="suite-meta">
			<span>{suite._count.cases} case{suite._count.cases !== 1 ? 's' : ''}</span>
			<span class="meta-sep">·</span>
			<span>Created by {suite.createdBy.name}</span>
		</div>
	</div>

	<div class="workspace" class:split={selectedCase || selectedCaseLoading}>
		<!-- Cases list -->
		<div class="cases-panel">
			<div class="panel-toolbar">
				<h2 class="panel-title">Test Cases</h2>
				<Button size="sm" on:click={() => (caseModalOpen = true)}>+ Add Case</Button>
			</div>

			{#if suite.cases.length === 0}
				<EmptyState title="No cases yet" description="Add your first test case to this suite." />
			{:else}
				<div class="case-list">
					{#each suite.cases as tc (tc.id)}
						<button
							class="case-row"
							class:selected={selectedCase?.id === tc.id}
							on:click={() => selectCase(tc)}
						>
							<div class="case-row-top">
								<span class="id-chip small">{tc.displayId}</span>
								<span class="priority-badge small {priorityClass(tc.priority)}">{tc.priority}</span>
								{#if tc.isAutomated}
									<span class="auto-badge">automated</span>
								{/if}
								<div class="case-row-actions" on:click|stopPropagation>
									<button
										class="icon-btn danger small"
										on:click={() => {
											confirmDeleteCase = { id: tc.id, displayId: tc.displayId, title: tc.title };
											confirmDeleteCaseOpen = true;
										}}
									>
										<svg
											width="11"
											height="11"
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
							<p class="case-title">{tc.title}</p>
							<span class="case-steps"
								>{tc._count.steps} step{tc._count.steps !== 1 ? 's' : ''}</span
							>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Case detail panel -->
		{#if selectedCase || selectedCaseLoading}
			<div class="detail-panel" transition:fly={{ x: 20, duration: 200 }}>
				{#if selectedCaseLoading}
					<div class="detail-loading">Loading…</div>
				{:else if selectedCase}
					<div class="detail-header">
						<div class="detail-title-row">
							<span class="id-chip large">{selectedCase.displayId}</span>
							<span class="priority-badge {priorityClass(selectedCase.priority)}"
								>{selectedCase.priority}</span
							>
							{#if selectedCase.isAutomated}
								<span class="auto-badge">automated</span>
							{/if}
							{#if selectedCase.automatedTag}
								<span class="tag-chip">@{selectedCase.automatedTag}</span>
							{/if}
							<div class="detail-header-actions">
								{#if !editingCase}
									<button class="icon-btn" title="Edit case" on:click={startEditCase}>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path
												d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
											/></svg
										>
									</button>
								{/if}
								<button
									class="icon-btn"
									title="Close"
									on:click={() => {
										selectedCase = null;
										editingCase = false;
									}}
								>
									<svg width="13" height="13" viewBox="0 0 14 14" fill="none"
										><path
											d="M1 1l12 12M13 1L1 13"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/></svg
									>
								</button>
							</div>
						</div>

						{#if editingCase}
							<div class="edit-case-form" transition:fly={{ y: -4, duration: 150 }}>
								<div class="field">
									<label class="field-label" for="edit-title">Title</label>
									<input
										id="edit-title"
										type="text"
										class="field-input"
										bind:value={editCaseForm.title}
									/>
								</div>
								<div class="field">
									<label class="field-label" for="edit-desc">Description</label>
									<textarea
										id="edit-desc"
										class="field-input field-textarea"
										bind:value={editCaseForm.description}
										rows="2"
									></textarea>
								</div>
								<div class="field-row">
									<div class="field">
										<label class="field-label" for="edit-prio">Priority</label>
										<select id="edit-prio" class="field-input" bind:value={editCaseForm.priority}>
											{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
										</select>
									</div>
									<div class="field">
										<label class="field-label" for="edit-tag">Automated tag</label>
										<input
											id="edit-tag"
											type="text"
											class="field-input mono"
											bind:value={editCaseForm.automatedTag}
											placeholder="test-123"
										/>
									</div>
								</div>
								<div class="modal-actions">
									<Button size="sm" on:click={handleUpdateCase} disabled={editCaseSaving}>
										{editCaseSaving ? 'Saving…' : 'Save'}
									</Button>
									<Button size="sm" variant="ghost" on:click={() => (editingCase = false)}
										>Cancel</Button
									>
								</div>
							</div>
						{:else}
							<h2 class="detail-case-title">{selectedCase.title}</h2>
							{#if selectedCase.description}
								<p class="detail-case-desc">{selectedCase.description}</p>
							{/if}
							<p class="detail-meta">Created by {selectedCase.createdBy.name}</p>
						{/if}
					</div>

					<!-- Sub-tabs: Steps / History -->
					<div class="detail-tabs">
						<button
							class="detail-tab"
							class:active={!historyTab}
							on:click={() => (historyTab = false)}>Steps</button
						>
						<button
							class="detail-tab"
							class:active={historyTab}
							on:click={() => (historyTab = true)}>History</button
						>
					</div>

					{#if !historyTab}
						<div class="steps-section" transition:fly={{ y: 4, duration: 140 }}>
							<div class="steps-toolbar">
								{#if !editingSteps}
									<Button size="sm" variant="ghost" on:click={() => (editingSteps = true)}
										>Edit Steps</Button
									>
								{:else}
									<Button size="sm" on:click={handleSaveSteps} disabled={stepsSaving}>
										{stepsSaving ? 'Saving…' : 'Save Steps'}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										on:click={() => {
											editingSteps = false;
											stepsForm = (selectedCase.steps ?? []).map((s) => ({ ...s }));
										}}>Cancel</Button
									>
								{/if}
								{#if editingSteps}
									<button class="add-step-btn" on:click={addStep}>+ Add step</button>
								{/if}
							</div>

							{#if editingSteps}
								<div class="steps-editor">
									{#if stepsForm.length === 0}
										<p class="no-steps">No steps. Click "+ Add step" to begin.</p>
									{:else}
										{#each stepsForm as step, i (i)}
											<div class="step-editor-row">
												<span class="step-num">{i + 1}</span>
												<div class="step-editor-fields">
													<input
														type="text"
														class="field-input"
														bind:value={step.action}
														placeholder="Action"
													/>
													<input
														type="text"
														class="field-input"
														bind:value={step.testData}
														placeholder="Test data (optional)"
													/>
													<input
														type="text"
														class="field-input"
														bind:value={step.expectedOutput}
														placeholder="Expected output"
													/>
												</div>
												<button class="icon-btn danger small" on:click={() => removeStep(i)}>
													<svg width="11" height="11" viewBox="0 0 14 14" fill="none"
														><path
															d="M1 1l12 12M13 1L1 13"
															stroke="currentColor"
															stroke-width="1.5"
															stroke-linecap="round"
														/></svg
													>
												</button>
											</div>
										{/each}
									{/if}
								</div>
							{:else if selectedCase.steps && selectedCase.steps.length > 0}
								<div class="steps-table">
									<div class="steps-table-head">
										<span class="col-num">#</span>
										<span class="col-action">Action</span>
										<span class="col-data">Test Data</span>
										<span class="col-expected">Expected Output</span>
									</div>
									{#each selectedCase.steps as step, i}
										<div class="steps-table-row">
											<span class="col-num">{i + 1}</span>
											<span class="col-action">{step.action}</span>
											<span class="col-data">{step.testData || '—'}</span>
											<span class="col-expected">{step.expectedOutput || '—'}</span>
										</div>
									{/each}
								</div>
							{:else}
								<p class="no-steps">No steps defined. Click "Edit Steps" to add them.</p>
							{/if}
						</div>
					{:else}
						<div class="history-section" transition:fly={{ y: 4, duration: 140 }}>
							{#if !selectedCase.history || selectedCase.history.length === 0}
								<p class="no-steps">
									No history yet. Results appear after test runs or automated builds.
								</p>
							{:else}
								<div class="history-list">
									{#each selectedCase.history as h (h.id)}
										<div class="history-row">
											<span class="result-badge {resultClass(h.result)}">{h.result}</span>
											<div class="history-info">
												<span class="history-source"
													>{h.source === 'automated'
														? 'Auto build'
														: (h.run?.title ?? 'Manual')}</span
												>
												<span class="history-by">{h.executedBy?.name ?? '—'}</span>
												<span class="history-date">{new Date(h.executedAt).toLocaleString()}</span>
											</div>
											{#if h.notes}
												<p class="history-notes">{h.notes}</p>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.loading-state {
		font-size: 0.875rem;
		color: var(--text-muted);
		padding: 3rem 0;
	}

	/* ── Breadcrumb ── */
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
	.bc-current {
		color: var(--text-muted);
	}

	/* ── Suite header ── */
	.suite-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.suite-title-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.suite-title {
		font-size: 1.75rem;
		font-weight: 600;
		color: var(--text);
	}

	.suite-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
		line-height: 1.5;
	}

	.suite-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.meta-sep {
		color: var(--border);
	}

	/* ── Workspace ── */
	.workspace {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
		align-items: start;
	}

	.workspace.split {
		grid-template-columns: 320px 1fr;
	}

	/* ── Cases panel ── */
	.cases-panel {
	}

	.panel-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.875rem;
	}

	.panel-title {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
	}

	.case-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.case-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		text-align: left;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.75rem;
		cursor: pointer;
		transition:
			border-color var(--duration-fast),
			background var(--duration-fast);
	}

	.case-row:hover {
		border-color: var(--accent);
	}

	.case-row.selected {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.case-row-top {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.case-row-actions {
		margin-left: auto;
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	.case-row:hover .case-row-actions {
		opacity: 1;
	}

	.case-title {
		font-size: 0.875rem;
		color: var(--text);
		line-height: 1.4;
	}

	.case-steps {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	/* ── Detail panel ── */
	.detail-panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.detail-loading {
		padding: 2rem;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.detail-header {
		padding: 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.detail-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}

	.detail-header-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.detail-case-title {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text);
		margin-bottom: 0.375rem;
	}

	.detail-case-desc {
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
		margin-bottom: 0.375rem;
	}

	.detail-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.detail-tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
	}

	.detail-tab {
		padding: 0.625rem 1rem;
		font-family: var(--font-body);
		font-size: 0.8125rem;
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

	.detail-tab:hover {
		color: var(--text);
	}
	.detail-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	/* ── Steps ── */
	.steps-section,
	.history-section {
		padding: 1rem 1.25rem;
	}

	.steps-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.875rem;
	}

	.add-step-btn {
		margin-left: auto;
		font-size: 0.8125rem;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		transition: background var(--duration-fast);
	}

	.add-step-btn:hover {
		background: var(--accent-soft);
	}

	.no-steps {
		font-size: 0.8125rem;
		color: var(--text-muted);
		padding: 1rem 0;
	}

	.steps-table {
		font-size: 0.8125rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.steps-table-head,
	.steps-table-row {
		display: grid;
		grid-template-columns: 28px 1fr 1fr 1fr;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		align-items: start;
	}

	.steps-table-head {
		background: var(--bg-subtle);
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.steps-table-row {
		border-top: 1px solid var(--border);
		color: var(--text);
		line-height: 1.5;
	}

	.col-num {
		color: var(--text-muted);
	}

	.steps-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.step-editor-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.step-num {
		font-size: 0.75rem;
		color: var(--text-muted);
		min-width: 20px;
		padding-top: 0.5rem;
	}

	.step-editor-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.edit-case-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	/* ── History ── */
	.history-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.history-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem;
		background: var(--bg-subtle);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
	}

	.history-info {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-wrap: wrap;
	}

	.history-source {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.history-by,
	.history-date {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.history-notes {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
	}

	/* ── Result / status badges ── */
	.result-badge {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0.5rem;
		border-radius: 100px;
		align-self: flex-start;
	}

	.result-badge.pass {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.result-badge.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.result-badge.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.result-badge.muted {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}

	/* ── Shared ── */
	.id-chip {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 4px;
		letter-spacing: 0.02em;
	}

	.id-chip.large {
		font-size: 0.75rem;
		padding: 0.1rem 0.45rem;
	}
	.id-chip.small {
		font-size: 0.65rem;
		padding: 0.08rem 0.35rem;
	}

	.priority-badge {
		font-size: 0.68rem;
		font-weight: 500;
		border-radius: 100px;
		padding: 0.15rem 0.5rem;
	}

	.priority-badge.small {
		font-size: 0.62rem;
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

	.auto-badge {
		font-size: 0.62rem;
		font-weight: 500;
		background: var(--pass-soft);
		color: var(--pass);
		border-radius: 100px;
		padding: 0.15rem 0.5rem;
	}

	.tag-chip {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.08rem 0.4rem;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.icon-btn.small {
		width: 24px;
		height: 24px;
	}
	.icon-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}
	.icon-btn.danger:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.field-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.field-hint {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--text-muted);
	}
	.field-textarea {
		height: auto;
		resize: vertical;
	}
	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem !important;
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

	@media (max-width: 768px) {
		.workspace.split {
			grid-template-columns: 1fr;
		}
	}
</style>
