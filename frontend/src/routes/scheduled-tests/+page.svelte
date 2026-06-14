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
	import { fetchSchedules, fetchCronJobs, saveCronJob, deleteCronJob } from '$lib/api/schedules';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	const CRON_REGEX =
		/^(\*|([0-5]?[0-9])) (\*|([01]?[0-9]|2[0-3])) (\*|([01]?[0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|[0-6])$/;

	let cronJobs = [];
	let scheduleOptions = [];
	let toast = null; // { type: 'success' | 'error', message }

	let modalOpen = false;
	let deleteModalOpen = false;
	let isEditing = false;
	let editTaskName = '';
	let taskToDelete = '';

	let form = { taskName: '', cronExpression: '', tags: '' };
	let formError = '';

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), 4000);
	}

	function openAddModal() {
		isEditing = false;
		editTaskName = '';
		form = { taskName: '', cronExpression: '', tags: '' };
		formError = '';
		modalOpen = true;
	}

	function openEditModal(job) {
		isEditing = true;
		editTaskName = job.taskName;
		form = { taskName: job.taskName, cronExpression: job.cronExpression, tags: job.tags };
		formError = '';
		modalOpen = true;
	}

	function openDeleteModal(taskName) {
		taskToDelete = taskName;
		deleteModalOpen = true;
	}

	async function handleSave() {
		if (!form.taskName || !form.cronExpression || !form.tags) {
			formError = 'All fields are required.';
			return;
		}
		if (!CRON_REGEX.test(form.cronExpression)) {
			formError = 'Invalid cron expression.';
			return;
		}
		formError = '';
		try {
			const data = await saveCronJob({ ...form, isEditing, editTaskName });
			if (data.message) {
				showToast('success', `${isEditing ? 'Updated' : 'Added'}: ${form.taskName}`);
				modalOpen = false;
				cronJobs = await fetchCronJobs();
			} else {
				formError = 'Failed to save. Please try again.';
			}
		} catch {
			formError = 'Network error.';
		}
	}

	async function handleDelete() {
		try {
			const data = await deleteCronJob(taskToDelete);
			if (data.message) {
				showToast('success', `Deleted: ${taskToDelete}`);
				cronJobs = await fetchCronJobs();
			} else {
				showToast('error', 'Could not delete cron job.');
			}
		} catch {
			showToast('error', 'Network error.');
		}
		deleteModalOpen = false;
		taskToDelete = '';
	}

	function cronLabel(expression) {
		return scheduleOptions.find((s) => s.value === expression)?.label ?? expression;
	}

	onMount(async () => {
		[cronJobs, scheduleOptions] = await Promise.all([fetchCronJobs(), fetchSchedules()]);
	});
</script>

<!-- Add/Edit modal -->
<Modal bind:open={modalOpen} title={isEditing ? 'Edit Cron Job' : 'New Cron Job'}>
	<form on:submit|preventDefault={handleSave} class="modal-form">
		<div class="field">
			<div class="field-label">
				<span>Task Name</span>
				<span class="field-hint">
					{isEditing ? 'Name is the ID — cannot be changed' : 'Use a unique, meaningful name'}
				</span>
			</div>
			<input
				type="text"
				class="field-input"
				bind:value={form.taskName}
				placeholder="nightly-login-suite"
				disabled={isEditing}
				required
			/>
		</div>

		<div class="field">
			<div class="field-label">
				<span>Schedule</span>
			</div>
			<select class="field-input" bind:value={form.cronExpression} required>
				<option value="" disabled selected>Select a schedule</option>
				{#each scheduleOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<div class="field-label">
				<span>Tags</span>
				<span class="field-hint">Multiple: @test-1 or @test-2</span>
			</div>
			<input
				type="text"
				class="field-input"
				bind:value={form.tags}
				placeholder="@suite-login"
				required
			/>
		</div>

		{#if formError}
			<p class="form-error">{formError}</p>
		{/if}

		<Button type="submit" size="md">
			{isEditing ? 'Save Changes' : 'Add Cron Job'}
		</Button>
	</form>
</Modal>

<!-- Delete confirmation modal -->
<Modal bind:open={deleteModalOpen} title="Delete Cron Job">
	<p class="confirm-text">
		Are you sure you want to delete <strong>{taskToDelete}</strong>? This cannot be undone.
	</p>
	<div class="confirm-actions">
		<Button variant="danger" on:click={handleDelete}>Delete</Button>
		<Button variant="ghost" on:click={() => (deleteModalOpen = false)}>Cancel</Button>
	</div>
</Modal>

<!-- Page -->
<div class="page-header">
	<div class="header-row">
		<div>
			<h1>Scheduled Tests</h1>
			<p class="subtitle">Manage recurring test runs via cron jobs</p>
		</div>
		<Button on:click={openAddModal}>+ New Job</Button>
	</div>
</div>

{#if toast}
	<div class="toast alert alert-{toast.type}" transition:fly={{ y: -8, duration: 240 }}>
		{toast.message}
	</div>
{/if}

<div class="card" style="padding: 0; overflow: hidden;">
	{#if cronJobs.length === 0}
		<p class="empty">No scheduled tests yet. Create one to get started.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Schedule</th>
						<th>Tags</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each cronJobs as job, i}
						<tr style="animation-delay: {i * 45}ms" class="job-row">
							<td class="job-name">{job.taskName}</td>
							<td>
								<Badge variant="schedule">{cronLabel(job.cronExpression)}</Badge>
							</td>
							<td>
								<span class="tag-text">{job.tags}</span>
							</td>
							<td class="actions-cell">
								<Button variant="ghost" size="sm" on:click={() => openEditModal(job)}>Edit</Button>
								<Button variant="danger" size="sm" on:click={() => openDeleteModal(job.taskName)}
									>Delete</Button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.page-header h1 {
		font-size: 2.5rem;
		margin-bottom: 0.375rem;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.job-row {
		animation: fadeUp 0.32s var(--ease-out) both;
	}

	.toast {
		margin-bottom: 1.25rem;
		border-radius: var(--radius-md);
	}

	.table-wrap {
		overflow-x: auto;
	}

	.job-name {
		font-weight: 400;
		font-size: 0.875rem;
	}

	.tag-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.actions-cell {
		display: flex;
		gap: 0.375rem;
	}

	.empty {
		padding: 3rem 1.5rem;
		color: var(--text-muted);
		font-size: 0.9375rem;
		text-align: center;
	}

	/* Modal form */
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	.confirm-text {
		font-size: 0.9375rem;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.confirm-text strong {
		color: var(--text);
		font-weight: 500;
	}

	.confirm-actions {
		display: flex;
		gap: 0.625rem;
		padding-top: 0.25rem;
	}
</style>
