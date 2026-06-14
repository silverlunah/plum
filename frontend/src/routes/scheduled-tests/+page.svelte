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
	import { activeCronJobs } from '$lib/stores/runner';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	const CRON_REGEX =
		/^(\*|([0-5]?[0-9])|\*\/[0-9]+) (\*|([01]?[0-9]|2[0-3])) (\*|([01]?[0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|[0-6](-[0-6])?)$/;

	const CUSTOM_SENTINEL = '__custom__';
	const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	let cronJobs = [];
	let scheduleOptions = [];
	let toast = null;

	let modalOpen = false;
	let deleteModalOpen = false;
	let isEditing = false;
	let editTaskName = '';
	let taskToDelete = '';

	const WORKER_OPTIONS = [1, 2, 4, 8];

	let form = { taskName: '', cronExpression: '', tags: '', workers: 1 };
	let selectedSchedule = '';
	let useCustomCron = false;
	let formError = '';

	function describeCron(expr) {
		if (!expr) return '';
		const parts = expr.trim().split(/\s+/);
		if (parts.length !== 5) return '';
		const [min, hour, dom, month, dow] = parts;

		const fmt = (h, m) => {
			const ap = h >= 12 ? 'PM' : 'AM';
			return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
		};
		const isNum = (s) => /^\d+$/.test(s);
		const h = isNum(hour) ? +hour : null;
		const m = isNum(min) ? +min : null;

		if (expr === '* * * * *') return 'Every minute';
		const everyN = min.match(/^\*\/(\d+)$/);
		if (everyN && hour === '*' && dom === '*' && month === '*' && dow === '*')
			return `Every ${everyN[1]} minutes`;
		if (m !== null && hour === '*' && dom === '*' && month === '*' && dow === '*')
			return `Every hour at :${String(m).padStart(2, '0')}`;
		if (m !== null && h !== null && dom === '*' && month === '*' && dow === '1-5')
			return `Weekdays at ${fmt(h, m)}`;
		if (m !== null && h !== null && dom === '*' && month === '*' && dow === '*')
			return `Daily at ${fmt(h, m)}`;
		if (m !== null && h !== null && dom === '*' && month === '*' && /^\d$/.test(dow))
			return `Every ${DAYS[+dow]} at ${fmt(h, m)}`;
		const d = isNum(dom) ? +dom : null;
		if (m !== null && h !== null && d !== null && month === '*' && dow === '*') {
			const sfx = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
			return `Monthly on the ${d}${sfx} at ${fmt(h, m)}`;
		}
		return '';
	}

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), 4000);
	}

	function handleScheduleChange(e) {
		if (e.target.value === CUSTOM_SENTINEL) {
			useCustomCron = true;
			form.cronExpression = '';
		} else {
			useCustomCron = false;
			form.cronExpression = e.target.value;
		}
	}

	function openAddModal() {
		isEditing = false;
		editTaskName = '';
		form = { taskName: '', cronExpression: '', tags: '', workers: 1 };
		selectedSchedule = '';
		useCustomCron = false;
		formError = '';
		modalOpen = true;
	}

	function openEditModal(job) {
		isEditing = true;
		editTaskName = job.taskName;
		form = { taskName: job.taskName, cronExpression: job.cronExpression, tags: job.tags, workers: job.workers ?? 1 };
		const isPreset = scheduleOptions.some((o) => o.value === job.cronExpression);
		useCustomCron = !isPreset;
		selectedSchedule = isPreset ? job.cronExpression : CUSTOM_SENTINEL;
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

<svelte:head><title>Scheduled Tests — Plum</title></svelte:head>

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
			<select
				class="field-input"
				bind:value={selectedSchedule}
				on:change={handleScheduleChange}
				required
			>
				<option value="" disabled>Select a schedule</option>
				{#each scheduleOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
				<option value={CUSTOM_SENTINEL}>Custom…</option>
			</select>

			{#if useCustomCron}
				<input
					type="text"
					class="field-input cron-input"
					bind:value={form.cronExpression}
					placeholder="0 9 * * 1-5"
					spellcheck="false"
				/>
				{#if form.cronExpression}
					<p class="cron-desc" class:cron-invalid={!CRON_REGEX.test(form.cronExpression)}>
						{CRON_REGEX.test(form.cronExpression)
							? (describeCron(form.cronExpression) || form.cronExpression)
							: 'Invalid cron expression'}
					</p>
				{/if}
			{/if}
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

		<div class="field">
			<div class="field-label">
				<span>Runners</span>
				<span class="field-hint">Parallel workers for this job</span>
			</div>
			<div class="seg-control">
				{#each WORKER_OPTIONS as n}
					<button
						type="button"
						class="seg-btn"
						class:active={form.workers === n}
						on:click={() => (form.workers = n)}
					>
						{n}
					</button>
				{/each}
			</div>
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
						<th>Runners</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each cronJobs as job, i}
						<tr style="animation-delay: {i * 45}ms" class="job-row">
							<td class="job-name">
								{#if $activeCronJobs[job.taskName]}
									<span class="running-dot" title="Running now"></span>
								{/if}
								{job.taskName}
							</td>
							<td>
								<Badge variant="schedule">{cronLabel(job.cronExpression)}</Badge>
							</td>
							<td>
								<span class="tag-text">{job.tags}</span>
							</td>
							<td>
								<span class="workers-badge" class:multi={job.workers > 1}>
									{job.workers > 1 ? `×${job.workers}` : '—'}
								</span>
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.running-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--pass);
		flex-shrink: 0;
		animation: statusPulse 1.6s ease-in-out infinite;
	}

	@keyframes statusPulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.4; transform: scale(0.65); }
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

	/* Custom cron input */
	.cron-input {
		margin-top: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		letter-spacing: 0.03em;
	}

	.cron-desc {
		margin-top: 0.375rem;
		font-size: 0.8rem;
		color: var(--pass);
	}

	.cron-desc.cron-invalid {
		color: var(--fail);
	}

	/* Segmented control */
	.seg-control {
		display: flex;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		width: fit-content;
	}

	.seg-btn {
		padding: 0.375rem 0.875rem;
		font-size: 0.8125rem;
		font-family: inherit;
		background: var(--bg-elevated);
		color: var(--text-muted);
		border: none;
		border-right: 1px solid var(--border);
		cursor: pointer;
		transition: background var(--duration-fast), color var(--duration-fast);
	}

	.seg-btn:last-child {
		border-right: none;
	}

	.seg-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.seg-btn.active {
		background: var(--accent);
		color: #fff;
	}

	/* Workers badge in table */
	.workers-badge {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.workers-badge.multi {
		color: var(--accent);
		font-weight: 500;
	}
</style>
