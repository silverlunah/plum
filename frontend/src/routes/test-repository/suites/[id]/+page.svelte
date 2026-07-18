<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import { TOAST_TIMEOUT_MS, SUITE_CASES_PER_PAGE, CASE_HISTORY_BARS_MAX } from '$lib/constants';
	import {
		CANCEL_LABEL,
		SAVE_LABEL,
		CLOSE_LABEL,
		CLEAR_LABEL,
		SAVING_LABEL,
		CREATING_LABEL,
		LOADING_LABEL,
		AUTOMATED_LABEL,
		CANNOT_BE_UNDONE_SUFFIX,
		DELETE_LABEL
	} from '$lib/copy/common';
	import {
		TEST_REPOSITORY_BREADCRUMB,
		NAME_LABEL,
		DESCRIPTION_LABEL,
		PRIORITY_LABEL,
		TITLE_LABEL,
		TITLE_REQUIRED_ERROR,
		DELETE_TEST_CASE_TITLE,
		NEW_TEST_CASE_MODAL_TITLE,
		CREATE_CASE_LABEL,
		TC_TITLE_PLACEHOLDER,
		TC_DESC_PLACEHOLDER,
		EDIT_SUITE_MODAL_TITLE,
		EDIT_SUITE_TITLE,
		EDIT_CASE_TITLE,
		TEST_CASES_LABEL,
		ADD_CASE_LABEL,
		FILTER_PLACEHOLDER,
		NO_CASES_YET_TITLE,
		NO_CASES_YET_DESC,
		NO_CASES_MATCH_PREFIX,
		DATE_LABEL,
		STEP_LABEL,
		ACTION_COL_LABEL,
		TEST_DATA_LABEL,
		EXPECTED_OUTPUT_LABEL,
		STEP_ACTION_PLACEHOLDER,
		OPTIONAL_PLACEHOLDER,
		EXPECTED_OUTPUT_PLACEHOLDER,
		NO_STEPS_MESSAGE,
		ADD_STEP_LABEL,
		EDIT_STEPS_LABEL,
		NO_STEPS_DEFINED_MESSAGE,
		STEPS_TAB_LABEL,
		HISTORY_TAB_LABEL,
		NO_HISTORY_MESSAGE,
		AUTOMATED_RUN_LINK,
		REPORT_NOT_FOUND,
		RUN_NOT_FOUND,
		FAILED_TO_LOAD_SUITE,
		FAILED_TO_LOAD_CASE,
		FAILED_TO_DELETE_CASE,
		TEST_CASE_UPDATED_TOAST,
		STEPS_SAVED_TOAST,
		SUITE_UPDATED_TOAST,
		suiteDetailTitle,
		createdByCapitalized,
		caseCreatedToast,
		caseDeletedToast,
		caseCount,
		stepCount,
		saveStepsLabel,
		runLinkLabel
	} from '$lib/copy/repository';

	const suiteId = $page.params.id;

	const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

	let suite = null;
	let loading = true;
	let toast = null;

	let caseModalOpen = false;
	let caseForm = { title: '', description: '', priority: 'Medium' };
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

	let caseSearch = '';
	let casesPage = 1;
	let casesSort = (() => {
		try {
			const v = sessionStorage.getItem('plum:repo:cases:sort');
			if (v) return JSON.parse(v);
		} catch {}
		return { by: 'createdAt', order: 'asc' };
	})();

	const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

	$: caseQ = caseSearch.trim().toLowerCase();
	$: filteredCases = suite?.cases
		? suite.cases.filter(
				(c) =>
					!caseQ ||
					c.displayId.toLowerCase().includes(caseQ) ||
					c.title.toLowerCase().includes(caseQ)
			)
		: [];
	$: sortedCases = [...filteredCases].sort((a, b) => {
		const dir = casesSort.order === 'asc' ? 1 : -1;
		if (casesSort.by === 'displayId') return dir * a.displayId.localeCompare(b.displayId);
		if (casesSort.by === 'name') return dir * a.title.localeCompare(b.title);
		if (casesSort.by === 'priority')
			return dir * ((PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
		return dir * (new Date(a.createdAt) - new Date(b.createdAt));
	});
	$: casesTotalPages = Math.ceil(sortedCases.length / SUITE_CASES_PER_PAGE);
	$: pagedCases = sortedCases.slice(
		(casesPage - 1) * SUITE_CASES_PER_PAGE,
		casesPage * SUITE_CASES_PER_PAGE
	);
	$: if (caseSearch) casesPage = 1;

	function applyCasesSort(by) {
		if (casesSort.by === by) {
			casesSort.order = casesSort.order === 'asc' ? 'desc' : 'asc';
		} else {
			casesSort = { by, order: 'asc' };
		}
		try {
			sessionStorage.setItem('plum:repo:cases:sort', JSON.stringify(casesSort));
		} catch {}
	}
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
			showToast('error', FAILED_TO_LOAD_SUITE);
		} finally {
			loading = false;
		}
	});

	async function handleCreateCase() {
		if (!caseForm.title.trim()) {
			caseFormError = TITLE_REQUIRED_ERROR;
			return;
		}
		caseFormError = '';
		caseFormSaving = true;
		try {
			const tc = await createTestCase({ suiteId, ...caseForm });
			suite = { ...suite, cases: [...suite.cases, tc], _count: { cases: suite._count.cases + 1 } };
			casesPage = Math.ceil(suite.cases.length / SUITE_CASES_PER_PAGE);
			caseModalOpen = false;
			caseForm = { title: '', description: '', priority: 'Medium' };
			showToast('success', caseCreatedToast(tc.displayId));
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
			showToast('error', FAILED_TO_LOAD_CASE);
		} finally {
			selectedCaseLoading = false;
		}
	}

	function startEditCase() {
		editCaseForm = {
			title: selectedCase.title,
			description: selectedCase.description,
			priority: selectedCase.priority
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
			showToast('success', TEST_CASE_UPDATED_TOAST);
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
			showToast('success', STEPS_SAVED_TOAST);
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
			showToast('success', caseDeletedToast(displayId));
		} catch {
			showToast('error', FAILED_TO_DELETE_CASE);
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
			showToast('success', SUITE_UPDATED_TOAST);
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

	// selectedCase.history arrives newest-first; bars read oldest → newest, left → right.
	function recentHistory(history) {
		if (!history || history.length === 0) return [];
		return history.slice(0, CASE_HISTORY_BARS_MAX).slice().reverse();
	}
</script>

<svelte:head><title>{suiteDetailTitle(suite)}</title></svelte:head>

<Toast {toast} />

<ConfirmModal
	bind:open={confirmDeleteCaseOpen}
	title={DELETE_TEST_CASE_TITLE}
	on:confirm={() => handleDeleteCase(confirmDeleteCase?.id, confirmDeleteCase?.displayId)}
>
	{#if confirmDeleteCase}
		{DELETE_LABEL}
		<strong>{confirmDeleteCase.displayId} — {confirmDeleteCase.title}</strong
		>{CANNOT_BE_UNDONE_SUFFIX}
	{/if}
</ConfirmModal>

<Modal bind:open={caseModalOpen} title={NEW_TEST_CASE_MODAL_TITLE}>
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="tc-title">{TITLE_LABEL}</label>
			<input
				id="tc-title"
				type="text"
				class="field-input"
				bind:value={caseForm.title}
				placeholder={TC_TITLE_PLACEHOLDER}
			/>
		</div>
		<div class="field">
			<label class="field-label" for="tc-desc">{DESCRIPTION_LABEL}</label>
			<textarea
				id="tc-desc"
				class="field-input field-textarea"
				bind:value={caseForm.description}
				placeholder={TC_DESC_PLACEHOLDER}
				rows="2"
			></textarea>
		</div>
		<div class="field">
			<label class="field-label" for="tc-prio">{PRIORITY_LABEL}</label>
			<select id="tc-prio" class="field-input" bind:value={caseForm.priority}>
				{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		{#if caseFormError}<p class="form-error">{caseFormError}</p>{/if}
		<div class="modal-actions">
			<Button on:click={handleCreateCase} disabled={caseFormSaving}>
				{caseFormSaving ? CREATING_LABEL : CREATE_CASE_LABEL}
			</Button>
			<Button
				variant="ghost"
				on:click={() => {
					caseModalOpen = false;
					caseFormError = '';
				}}>{CANCEL_LABEL}</Button
			>
		</div>
	</div>
</Modal>

<Modal bind:open={editSuiteOpen} title={EDIT_SUITE_MODAL_TITLE}>
	<div class="form-fields">
		<div class="field">
			<label class="field-label" for="es-name">{NAME_LABEL}</label>
			<input id="es-name" type="text" class="field-input" bind:value={editSuiteForm.name} />
		</div>
		<div class="field">
			<label class="field-label" for="es-desc">{DESCRIPTION_LABEL}</label>
			<textarea
				id="es-desc"
				class="field-input field-textarea"
				bind:value={editSuiteForm.description}
				rows="2"
			></textarea>
		</div>
		<div class="field">
			<label class="field-label" for="es-prio">{PRIORITY_LABEL}</label>
			<select id="es-prio" class="field-input" bind:value={editSuiteForm.priority}>
				{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
			</select>
		</div>
		<div class="modal-actions">
			<Button on:click={handleUpdateSuite} disabled={editSuiteSaving}>
				{editSuiteSaving ? SAVING_LABEL : SAVE_LABEL}
			</Button>
			<Button variant="ghost" on:click={() => (editSuiteOpen = false)}>{CANCEL_LABEL}</Button>
		</div>
	</div>
</Modal>

{#if loading}
	<div class="loading-state">{LOADING_LABEL}</div>
{:else if suite}
	<div class="breadcrumb">
		<a href="/test-repository" class="bc-link">{TEST_REPOSITORY_BREADCRUMB}</a>
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
				title={EDIT_SUITE_TITLE}
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
			<span>{caseCount(suite._count.cases)}</span>
			<span class="meta-sep">·</span>
			<span>{createdByCapitalized(suite.createdBy.name)}</span>
		</div>
	</div>

	<div class="workspace" class:split={selectedCase || selectedCaseLoading}>
		<!-- Cases list -->
		<div class="cases-panel">
			<div class="panel-toolbar">
				<h2 class="panel-title">{TEST_CASES_LABEL}</h2>
				<Button size="sm" on:click={() => (caseModalOpen = true)}>{ADD_CASE_LABEL}</Button>
			</div>

			{#if suite.cases.length > 0}
				<div class="case-search">
					<svg
						class="case-search-icon"
						width="12"
						height="12"
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
						class="case-search-input"
						placeholder={FILTER_PLACEHOLDER}
						bind:value={caseSearch}
					/>
					{#if caseSearch}
						<button
							class="case-search-clear"
							on:click={() => (caseSearch = '')}
							aria-label={CLEAR_LABEL}
						>
							<svg
								width="10"
								height="10"
								viewBox="0 0 14 14"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg
							>
						</button>
					{/if}
				</div>
			{/if}

			{#if suite.cases.length > 0}
				<div class="case-sort-bar">
					{#each [['createdAt', DATE_LABEL], ['displayId', 'ID'], ['name', NAME_LABEL], ['priority', PRIORITY_LABEL]] as [val, label]}
						<button
							class="case-sort-chip"
							class:active={casesSort.by === val}
							on:click={() => applyCasesSort(val)}
						>
							{label}
							{#if casesSort.by === val}
								<span class="case-sort-dir">{casesSort.order === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			{#if suite.cases.length === 0}
				<EmptyState title={NO_CASES_YET_TITLE} description={NO_CASES_YET_DESC} />
			{:else if filteredCases.length === 0}
				<div class="case-no-results">{NO_CASES_MATCH_PREFIX} "<strong>{caseSearch}</strong>"</div>
			{:else}
				<div class="case-list">
					{#each pagedCases as tc (tc.id)}
						<div
							class="case-row"
							class:selected={selectedCase?.id === tc.id}
							role="button"
							tabindex="0"
							on:click={() => selectCase(tc)}
							on:keydown={(e) => e.key === 'Enter' && selectCase(tc)}
						>
							<div class="case-row-top">
								<span class="id-chip small">{tc.displayId}</span>
								<span class="priority-badge small {priorityClass(tc.priority)}">{tc.priority}</span>
								{#if tc.isAutomated}
									<span class="auto-badge">{AUTOMATED_LABEL}</span>
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
							<span class="case-steps">{stepCount(tc._count.steps)}</span>
						</div>
					{/each}
				</div>
				{#if casesTotalPages > 1}
					<div class="cases-pagination">
						<Pagination
							current={casesPage}
							total={casesTotalPages}
							on:change={(e) => (casesPage = e.detail)}
						/>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Case detail panel -->
		{#if selectedCase || selectedCaseLoading}
			<div class="detail-panel" transition:fly={{ x: 20, duration: 200 }}>
				{#if selectedCaseLoading}
					<div class="detail-loading">{LOADING_LABEL}</div>
				{:else if selectedCase}
					<div class="detail-header">
						<div class="detail-title-row">
							<span class="id-chip large">{selectedCase.displayId}</span>
							<span class="priority-badge {priorityClass(selectedCase.priority)}"
								>{selectedCase.priority}</span
							>
							{#if selectedCase.isAutomated}
								<span class="auto-badge">{AUTOMATED_LABEL}</span>
							{/if}
							<div class="detail-header-actions">
								{#if !editingCase}
									<button class="icon-btn" title={EDIT_CASE_TITLE} on:click={startEditCase}>
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
									title={CLOSE_LABEL}
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
									<label class="field-label" for="edit-title">{TITLE_LABEL}</label>
									<input
										id="edit-title"
										type="text"
										class="field-input"
										bind:value={editCaseForm.title}
									/>
								</div>
								<div class="field">
									<label class="field-label" for="edit-desc">{DESCRIPTION_LABEL}</label>
									<textarea
										id="edit-desc"
										class="field-input field-textarea"
										bind:value={editCaseForm.description}
										rows="2"
									></textarea>
								</div>
								<div class="field">
									<label class="field-label" for="edit-prio">{PRIORITY_LABEL}</label>
									<select id="edit-prio" class="field-input" bind:value={editCaseForm.priority}>
										{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
									</select>
								</div>
								<div class="modal-actions">
									<Button size="sm" on:click={handleUpdateCase} disabled={editCaseSaving}>
										{editCaseSaving ? SAVING_LABEL : SAVE_LABEL}
									</Button>
									<Button size="sm" variant="ghost" on:click={() => (editingCase = false)}
										>{CANCEL_LABEL}</Button
									>
								</div>
							</div>
						{:else}
							<h2 class="detail-case-title">{selectedCase.title}</h2>
							{#if selectedCase.description}
								<p class="detail-case-desc">{selectedCase.description}</p>
							{/if}
							<p class="detail-meta">{createdByCapitalized(selectedCase.createdBy.name)}</p>
							{#if selectedCase.history && selectedCase.history.length > 0}
								<div class="case-history-bars">
									{#each recentHistory(selectedCase.history) as h (h.id)}
										<span
											class="history-bar {resultClass(h.result)}"
											title="{h.result} — {new Date(h.executedAt).toLocaleString()}"
										></span>
									{/each}
								</div>
							{/if}
						{/if}
					</div>

					<!-- Sub-tabs: Steps / History -->
					<div class="detail-tabs">
						<button
							class="detail-tab"
							class:active={!historyTab}
							on:click={() => (historyTab = false)}>{STEPS_TAB_LABEL}</button
						>
						<button
							class="detail-tab"
							class:active={historyTab}
							on:click={() => (historyTab = true)}>{HISTORY_TAB_LABEL}</button
						>
					</div>

					{#if !historyTab}
						<div class="steps-section" transition:fly={{ y: 4, duration: 140 }}>
							<div class="steps-toolbar">
								{#if !editingSteps}
									<Button size="sm" variant="ghost" on:click={() => (editingSteps = true)}
										>{EDIT_STEPS_LABEL}</Button
									>
								{:else}
									<Button size="sm" on:click={handleSaveSteps} disabled={stepsSaving}>
										{saveStepsLabel(stepsSaving)}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										on:click={() => {
											editingSteps = false;
											stepsForm = (selectedCase.steps ?? []).map((s) => ({ ...s }));
										}}>{CANCEL_LABEL}</Button
									>
								{/if}
								{#if editingSteps}
									<button class="add-step-btn" on:click={addStep}>{ADD_STEP_LABEL}</button>
								{/if}
							</div>

							{#if editingSteps}
								<div class="steps-editor">
									{#if stepsForm.length === 0}
										<p class="no-steps">{NO_STEPS_MESSAGE}</p>
									{:else}
										{#each stepsForm as step, i (i)}
											<div class="step-editor-row">
												<span class="step-num">{i + 1}</span>
												<div class="step-editor-fields">
													<div class="step-field">
														<label class="step-field-label">{STEP_LABEL}</label>
														<input
															type="text"
															class="field-input"
															bind:value={step.action}
															placeholder={STEP_ACTION_PLACEHOLDER}
														/>
													</div>
													<div class="step-field">
														<label class="step-field-label">{TEST_DATA_LABEL}</label>
														<input
															type="text"
															class="field-input"
															bind:value={step.testData}
															placeholder={OPTIONAL_PLACEHOLDER}
														/>
													</div>
													<div class="step-field">
														<label class="step-field-label">{EXPECTED_OUTPUT_LABEL}</label>
														<input
															type="text"
															class="field-input"
															bind:value={step.expectedOutput}
															placeholder={EXPECTED_OUTPUT_PLACEHOLDER}
														/>
													</div>
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
										<span class="col-action">{ACTION_COL_LABEL}</span>
										<span class="col-data">{TEST_DATA_LABEL}</span>
										<span class="col-expected">{EXPECTED_OUTPUT_LABEL}</span>
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
								<p class="no-steps">{NO_STEPS_DEFINED_MESSAGE}</p>
							{/if}
						</div>
					{:else}
						<div class="history-section" transition:fly={{ y: 4, duration: 140 }}>
							{#if !selectedCase.history || selectedCase.history.length === 0}
								<p class="no-steps">
									{NO_HISTORY_MESSAGE}
								</p>
							{:else}
								<div class="history-list">
									{#each selectedCase.history as h (h.id)}
										<div class="history-row">
											<span class="result-badge {resultClass(h.result)}">{h.result}</span>
											<div class="history-info">
												{#if h.source === 'automated' && h.report?.id}
													<a
														href="/reports/{h.report.id}"
														target="_blank"
														rel="noopener noreferrer"
														class="history-source history-link">{AUTOMATED_RUN_LINK}</a
													>
												{:else if h.source === 'automated'}
													<span class="history-source history-missing">{REPORT_NOT_FOUND}</span>
												{:else if h.run?.id}
													<a
														href="/test-repository/runs/{h.run.id}"
														target="_blank"
														rel="noopener noreferrer"
														class="history-source history-link">{runLinkLabel(h.run.title)}</a
													>
												{:else}
													<span class="history-source history-missing">{RUN_NOT_FOUND}</span>
												{/if}
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

	/* ── Case search ── */
	.case-search {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 0.625rem;
	}

	.case-search-icon {
		position: absolute;
		left: 0.6rem;
		color: var(--text-muted);
		pointer-events: none;
	}

	.case-search-input {
		width: 100%;
		height: 30px;
		padding: 0 1.75rem 0 2rem;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		outline: none;
		transition: border-color var(--duration-fast);
	}

	.case-search-input::placeholder {
		color: var(--text-muted);
	}
	.case-search-input:focus {
		border-color: var(--accent);
	}
	.case-search-input::-webkit-search-cancel-button {
		display: none;
	}

	.case-search-clear {
		position: absolute;
		right: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 0;
	}

	.case-search-clear:hover {
		color: var(--text);
	}

	.case-no-results {
		font-size: 0.8125rem;
		color: var(--text-muted);
		padding: 1rem 0.25rem;
	}

	.case-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.cases-pagination {
		margin-top: 0.875rem;
	}

	/* ── Case sort bar ── */
	.case-sort-bar {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-bottom: 0.625rem;
		flex-wrap: wrap;
	}

	.case-sort-chip {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		height: 24px;
		padding: 0 0.5rem;
		font-family: var(--font-body);
		font-size: 0.75rem;
		color: var(--text-muted);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast),
			background var(--duration-fast);
	}

	.case-sort-chip:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.case-sort-chip.active {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.case-sort-dir {
		font-size: 0.65rem;
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
		overflow-y: auto;
		position: sticky;
		top: calc(56px + 1.5rem);
		max-height: calc(100vh - 56px - 3rem);
		padding-bottom: 1.5rem;
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

	.case-history-bars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 16px;
		margin-top: 0.5rem;
	}

	.history-bar {
		width: 4px;
		height: 100%;
		border-radius: 1px;
		background: var(--border);
	}

	.history-bar.pass {
		background: var(--pass);
	}

	.history-bar.fail {
		background: var(--fail);
	}

	.history-bar.warn {
		background: var(--warn);
	}

	.history-bar.muted {
		background: var(--text-muted);
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
		align-items: flex-end;
		gap: 0.5rem;
	}

	.step-num {
		font-size: 0.75rem;
		color: var(--text-muted);
		min-width: 20px;
		padding-bottom: 0.5rem;
	}

	.step-editor-fields {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
	}

	.step-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.step-field-label {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
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

	.history-link {
		color: var(--accent);
		text-decoration: none;
	}

	.history-link:hover {
		text-decoration: underline;
	}

	.history-missing {
		font-style: italic;
		color: var(--text-muted);
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
		border-radius: var(--radius-pill);
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
		border-radius: var(--radius-pill);
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
		border-radius: var(--radius-pill);
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
