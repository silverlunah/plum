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
	import {
		fetchCronJobs,
		saveCronJob,
		deleteCronJob,
		runCronJobNow,
		toggleCronJob
	} from '$lib/api/schedules';
	import { fetchRunners } from '$lib/api/runners';
	import { fetchIntegrations } from '$lib/api/settings';
	import { activeCronJobs } from '$lib/stores/runner';
	import { BROWSERS, TOAST_TIMEOUT_MS } from '$lib/constants';
	import { stagger } from '$lib/utils/format';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	const CRON_REGEX =
		/^(\*|([0-5]?[0-9])|\*\/[0-9]+) (\*|([01]?[0-9]|2[0-3])) (\*|([01]?[0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|[0-6](-[0-6])?)$/;

	const CUSTOM_SENTINEL = '__custom__';
	const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	const scheduleOptions = [
		{ label: 'Every minute', value: '* * * * *' },
		{ label: 'Every hour', value: '0 * * * *' },
		{ label: 'Every midnight', value: '0 0 * * *' },
		{ label: 'Every Sunday', value: '0 0 * * 0' }
	];

	let cronJobs = [];
	let availableRunners = [];
	let integrations = { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	let toast = null;

	let modalOpen = false;
	let deleteModalOpen = false;
	let isEditing = false;
	let editTaskName = '';
	let taskToDelete = '';

	let form = {
		taskName: '',
		cronExpression: '',
		tags: '',
		workers: 1,
		browser: 'chromium',
		runnerIds: ['built-in'],
		notifyDiscord: false,
		notifySlack: false
	};
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
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
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

	function toggleFormRunner(id) {
		const current = form.runnerIds;
		if (current.includes(id) && current.length === 1) return;
		form.runnerIds = current.includes(id) ? current.filter((r) => r !== id) : [...current, id];
	}

	function adjustFormWorkers(delta) {
		form.workers = Math.max(1, Math.min(10, (form.workers || 1) + delta));
	}

	function openAddModal() {
		isEditing = false;
		editTaskName = '';
		form = {
			taskName: '',
			cronExpression: '',
			tags: '',
			workers: 1,
			browser: 'chromium',
			runnerIds: ['built-in'],
			notifyDiscord: false,
			notifySlack: false
		};
		selectedSchedule = '';
		useCustomCron = false;
		formError = '';
		modalOpen = true;
	}

	function openEditModal(job) {
		isEditing = true;
		editTaskName = job.taskName;
		const validIds = new Set(['built-in', ...availableRunners.map((r) => r.id)]);
		const storedIds = job.runnerIds ? job.runnerIds.split(',').map((s) => s.trim()) : ['built-in'];
		const prunedIds = storedIds.filter((id) => validIds.has(id));
		form = {
			taskName: job.taskName,
			cronExpression: job.cronExpression,
			tags: job.tags,
			workers: job.workers ?? 1,
			browser: job.browser ?? 'chromium',
			runnerIds: prunedIds.length > 0 ? prunedIds : ['built-in'],
			notifyDiscord: job.notifyDiscord ?? false,
			notifySlack: job.notifySlack ?? false
		};
		const isPreset = scheduleOptions.some((o) => o.value === job.cronExpression);
		useCustomCron = !isPreset;
		selectedSchedule = isPreset ? job.cronExpression : CUSTOM_SENTINEL;
		formError = '';
		modalOpen = true;
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

	async function handleToggle(job) {
		const next = !job.enabled;
		cronJobs = cronJobs.map((j) => (j.taskName === job.taskName ? { ...j, enabled: next } : j));
		try {
			await toggleCronJob(job.taskName, next);
		} catch {
			cronJobs = cronJobs.map((j) => (j.taskName === job.taskName ? { ...j, enabled: !next } : j));
			showToast('error', 'Could not update schedule.');
		}
	}

	async function handleRunNow(taskName) {
		try {
			await runCronJobNow(taskName);
			showToast('success', `Started: ${taskName}`);
		} catch {
			showToast('error', 'Could not trigger run.');
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
		[cronJobs, availableRunners, integrations] = await Promise.all([
			fetchCronJobs(),
			fetchRunners().catch(() => []),
			fetchIntegrations().catch(() => ({
				discordWebhookUrl: '',
				slackWebhookUrl: '',
				notifyPublicUrl: ''
			}))
		]);
	});
</script>

<svelte:head><title>Scheduled Tests — Plum</title></svelte:head>

<!-- Add/Edit modal -->
<Modal bind:open={modalOpen} title={isEditing ? 'Edit Cron Job' : 'New Cron Job'}>
	<form on:submit|preventDefault={handleSave} class="modal-form">
		<div class="field">
			<div class="field-label">
				<span>Task Name</span>
				<span class="field-hint">Use a unique, meaningful name</span>
			</div>
			<input
				type="text"
				class="field-input"
				bind:value={form.taskName}
				placeholder="nightly-login-suite"
				required
			/>
		</div>

		<div class="field">
			<div class="field-label"><span>Schedule</span></div>
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
							? describeCron(form.cronExpression) || form.cronExpression
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
				<span>Workers</span>
				<span class="field-hint">Parallel workers for this job</span>
			</div>
			<div class="stepper">
				<button
					type="button"
					class="step-btn"
					on:click={() => adjustFormWorkers(-1)}
					disabled={form.workers <= 1}>−</button
				>
				<span class="step-val">{form.workers}</span>
				<button
					type="button"
					class="step-btn"
					on:click={() => adjustFormWorkers(1)}
					disabled={form.workers >= 10}>+</button
				>
			</div>
		</div>

		<div class="field">
			<div class="field-label"><span>Browser</span></div>
			<div class="seg-control">
				{#each BROWSERS as b}
					<button
						type="button"
						class="seg-btn"
						class:active={form.browser === b.id}
						on:click={() => (form.browser = b.id)}
					>
						<span class="seg-num">{b.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="field">
			<div class="field-label">
				<span>Runners</span>
				<span class="field-hint">Select one or more nodes</span>
			</div>
			<div class="runner-checks">
				<label class="runner-check-option">
					<input
						type="checkbox"
						checked={form.runnerIds.includes('built-in')}
						on:change={() => toggleFormRunner('built-in')}
					/>
					<span class="runner-check-dot built-in"></span>
					<span>Built-in</span>
					<span class="runner-check-hint">this server</span>
				</label>
				{#each availableRunners as r}
					<label class="runner-check-option">
						<input
							type="checkbox"
							checked={form.runnerIds.includes(r.id)}
							on:change={() => toggleFormRunner(r.id)}
						/>
						<span class="runner-check-dot remote"></span>
						<span>{r.name}</span>
						<span class="runner-check-hint">{r.url}</span>
					</label>
				{/each}
			</div>
		</div>

		{#if integrations.discordWebhookUrl || integrations.slackWebhookUrl}
			<div class="field">
				<div class="field-label"><span>Notifications</span></div>
				<div class="notify-checks">
					{#if integrations.discordWebhookUrl}
						<label class="notify-check-option">
							<input type="checkbox" bind:checked={form.notifyDiscord} />
							<span>Discord</span>
						</label>
					{/if}
					{#if integrations.slackWebhookUrl}
						<label class="notify-check-option">
							<input type="checkbox" bind:checked={form.notifySlack} />
							<span>Slack</span>
						</label>
					{/if}
				</div>
			</div>
		{/if}

		{#if formError}
			<p class="form-error">{formError}</p>
		{/if}

		<Button type="submit" size="md">{isEditing ? 'Save Changes' : 'Add Cron Job'}</Button>
	</form>
</Modal>

<!-- Delete confirmation -->
<ConfirmModal bind:open={deleteModalOpen} title="Delete Cron Job" on:confirm={handleDelete}>
	Are you sure you want to delete <strong>{taskToDelete}</strong>? This cannot be undone.
</ConfirmModal>

<Toast {toast} />

<div class="page-header">
	<div class="header-row">
		<div>
			<h1>Scheduled Tests</h1>
			<p class="subtitle">Manage recurring test runs via cron jobs</p>
		</div>
		<Button on:click={openAddModal}>+ New Job</Button>
	</div>
</div>

<div class="card" style="padding: 0; overflow: hidden;">
	{#if cronJobs.length === 0}
		<EmptyState message="No scheduled tests yet. Create one to get started." size="sm" />
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th class="th-toggle"></th>
						<th class="th-run"></th>
						<th>Name</th>
						<th>Schedule</th>
						<th>Tags</th>
						<th>Workers</th>
						<th>Browser</th>
						<th>Runner</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each cronJobs as job, i}
						{@const ids = job.runnerIds
							? job.runnerIds.split(',').map((s) => s.trim())
							: ['built-in']}
						<tr style={stagger(i)} class="job-row" class:disabled={!job.enabled}>
							<td class="td-toggle">
								<button
									class="toggle-btn"
									class:on={job.enabled}
									on:click={() => handleToggle(job)}
									title={job.enabled ? 'Disable schedule' : 'Enable schedule'}
									aria-label={job.enabled ? 'Disable schedule' : 'Enable schedule'}
									aria-pressed={job.enabled}
								>
									<span class="toggle-knob"></span>
								</button>
							</td>
							<td class="td-run">
								<button
									class="run-icon-btn"
									on:click={() => handleRunNow(job.taskName)}
									title="Run {job.taskName} now"
								>
									<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
										<polygon points="5,3 19,12 5,21" />
									</svg>
								</button>
							</td>
							<td class="job-name">
								{#if $activeCronJobs[job.taskName]}
									<span class="running-dot" title="Running now"></span>
								{/if}
								{job.taskName}
							</td>
							<td><Badge variant="schedule">{cronLabel(job.cronExpression)}</Badge></td>
							<td><span class="tag-text">{job.tags}</span></td>
							<td>
								<span class="workers-badge" class:multi={job.workers > 1}>×{job.workers}</span>
							</td>
							<td><span class="browser-badge">{job.browser ?? 'chromium'}</span></td>
							<td>
								<span class="runner-badge" class:multi-node={ids.length > 1}>
									{#if ids.length === 1 && ids[0] === 'built-in'}
										built-in
									{:else if ids.length === 1}
										{availableRunners.find((r) => r.id === ids[0])?.name ?? ids[0]}
									{:else}
										{ids.length} nodes
									{/if}
								</span>
							</td>
							<td class="actions-cell">
								<Button variant="ghost" size="sm" on:click={() => openEditModal(job)}>Edit</Button>
								<Button
									variant="danger"
									size="sm"
									on:click={() => {
										taskToDelete = job.taskName;
										deleteModalOpen = true;
									}}>Delete</Button
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
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(0.65);
		}
	}

	.tag-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.th-toggle,
	.td-toggle {
		width: 44px;
		padding-right: 0;
		text-align: center;
		padding-top: 20px;
	}

	.th-run,
	.td-run {
		width: 36px;
		padding-right: 0;
		text-align: center;
	}

	/* Toggle switch */
	.toggle-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		width: 32px;
		height: 18px;
		border-radius: 9px;
		border: none;
		background: var(--border);
		cursor: pointer;
		transition: background var(--duration-fast);
		flex-shrink: 0;
		padding: 0;
	}

	.toggle-btn.on {
		background: var(--pass);
	}

	.toggle-knob {
		position: absolute;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--white);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		transition: left var(--duration-fast);
	}

	.toggle-btn.on .toggle-knob {
		left: 16px;
	}

	.job-row.disabled {
		opacity: 0.45;
	}
	.job-row.disabled .toggle-btn {
		opacity: 1;
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
		color: var(--white);
		border-color: var(--accent);
	}

	.actions-cell {
		display: flex;
		gap: 0.375rem;
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

	/* Workers stepper */
	.stepper {
		display: flex;
		align-items: center;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		width: fit-content;
	}

	.step-btn {
		width: 28px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 400;
		line-height: 1;
		transition:
			color var(--duration-fast),
			background var(--duration-fast);
	}

	.step-btn:hover:not(:disabled) {
		color: var(--text);
		background: var(--bg-elevated);
	}

	.step-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.step-val {
		min-width: 28px;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text);
		font-family: 'JetBrains Mono', monospace;
		line-height: 30px;
		border-left: 1px solid var(--border);
		border-right: 1px solid var(--border);
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
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.375rem 0.875rem;
		font-family: inherit;
		background: var(--bg-elevated);
		color: var(--text-muted);
		border: none;
		border-right: 1px solid var(--border);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.seg-num {
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.seg-label {
		font-size: 0.625rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.75;
		line-height: 1.2;
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
		color: var(--white);
	}
	.seg-btn.active .seg-label {
		opacity: 0.85;
	}

	/* Table badges */
	.workers-badge {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.workers-badge.multi {
		color: var(--accent);
		font-weight: 500;
	}

	.browser-badge,
	.runner-badge {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.runner-badge.multi-node {
		color: var(--node);
		font-weight: 500;
	}

	/* Runner checkboxes in modal */
	.runner-checks {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.375rem 0.5rem;
		background: var(--bg-subtle);
	}

	.runner-check-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.375rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.8125rem;
		color: var(--text);
		transition: background var(--duration-fast);
	}

	.runner-check-option:hover {
		background: var(--bg-elevated);
	}

	.runner-check-option input[type='checkbox'] {
		accent-color: var(--accent);
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		cursor: pointer;
	}

	.runner-check-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.runner-check-dot.built-in {
		background: var(--accent);
	}
	.runner-check-dot.remote {
		background: var(--node);
	}

	.runner-check-hint {
		margin-left: auto;
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 180px;
	}

	/* Notification checkboxes in modal */
	.notify-checks {
		display: flex;
		flex-direction: row;
		gap: 1rem;
		padding: 0.375rem 0;
	}

	.notify-check-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text);
		cursor: pointer;
	}

	.notify-check-option input[type='checkbox'] {
		accent-color: var(--accent);
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		cursor: pointer;
	}
</style>
