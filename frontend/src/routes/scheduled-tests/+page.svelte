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

	let scheduledTests = [];
	let schedules = [];
	let cronExpression = '';
	let taskName = '';
	let tags = '';
	let successMessage = '';
	let errorMessage = '';
	let isModalOpen = false;
	let isEditing = false; // To track if we are editing a cron job
	let editTaskName = ''; // To store the task name of the cron job being edited
	let isDeleting = false; // To track if the user is confirming deletion
	let taskToDelete = ''; // The task name of the cron job being deleted

	const cronRegex =
		/^(\*|([0-5]?[0-9])) (\*|([01]?[0-9]|2[0-3])) (\*|([01]?[0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|[0-6])$/;

	// Fetch schedules from the settings.json through backend API
	async function fetchSchedules() {
		try {
			const res = await fetch('http://localhost:3001/schedules');
			const data = await res.json();

			if (data.schedules) {
				schedules = data.schedules;
			}
		} catch (error) {
			errorMessage = 'Error fetching schedules.';
			console.error('Error fetching schedules', error);
		}
	}

	// Fetch scheduled tests (cron jobs) from the backend API
	async function fetchScheduledTests() {
		try {
			const res = await fetch('http://localhost:3001/cron-jobs');
			const data = await res.json();
			if (data.cronJobs) {
				scheduledTests = data.cronJobs;
			}
		} catch (error) {
			errorMessage = 'Error fetching scheduled tests.';
			console.error('Error fetching scheduled tests:', error);
		}
	}

	// Add or edit a cron job via the API
	async function saveCronJob() {
		if (!cronExpression || !taskName || !tags) {
			errorMessage = 'Please fill in all fields';
			return;
		}

		// Validate cron expression
		if (!cronRegex.test(cronExpression)) {
			errorMessage = 'Invalid cron expression. Please use a valid cron format.';
			return;
		}

		// Lowercase " OR " while keeping other tags intact
		const formattedTags = tags.replace(/\sOR\s/gi, (match) => match.toLowerCase());

		try {
			let res;
			if (isEditing) {
				// Edit cron job
				res = await fetch(`http://localhost:3001/cron-jobs/${editTaskName}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ cronExpression, taskName, tags: formattedTags })
				});
			} else {
				// Add new cron job
				res = await fetch('http://localhost:3001/cron-jobs', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ cronExpression, taskName, tags: formattedTags })
				});
			}

			const data = await res.json();
			if (data.message) {
				successMessage = `Cron job ${isEditing ? 'updated' : 'added'}: ${data.message}`;
				fetchScheduledTests(); // Refresh the list
				setTimeout(() => {
					successMessage = ''; // Clear success message after 5 seconds
				}, 5000);
				clearModal();
			} else {
				errorMessage = 'Failed to save cron job';
			}
		} catch (error) {
			errorMessage = 'Error saving cron job.';
			console.error('Error saving cron job:', error);
		}
	}

	// Delete a cron job
	async function deleteCronJob(taskName) {
		try {
			const res = await fetch(`http://localhost:3001/cron-jobs/${taskName}`, {
				method: 'DELETE'
			});
			const data = await res.json();
			if (data.message) {
				successMessage = `Cron job deleted: ${data.message}`;
				// Refresh the list
				fetchScheduledTests();
				setTimeout(() => {
					successMessage = '';
				}, 5000);
			} else {
				errorMessage = 'Failed to delete cron job';
				setTimeout(() => {
					errorMessage = '';
				}, 5000);
			}
		} catch (error) {
			errorMessage = 'Error deleting cron job.';
			console.error('Error deleting cron job:', error);
		}
	}

	// Open modal to edit cron job
	function openEditModal(cronJob) {
		isEditing = true;
		editTaskName = cronJob.taskName;
		taskName = cronJob.taskName;
		cronExpression = cronJob.cronExpression;
		tags = cronJob.tags;
		isModalOpen = true;
	}

	// Reset modal values
	function clearModal() {
		isEditing = false;
		editTaskName = '';
		taskName = '';
		cronExpression = '';
		tags = '';
		isModalOpen = false;
	}

	// Open confirmation modal for deleting cron job
	function openDeleteConfirmation(taskName) {
		isDeleting = true;
		taskToDelete = taskName;
	}

	// Confirm deletion
	function confirmDelete() {
		deleteCronJob(taskToDelete);
		isDeleting = false;
		taskToDelete = '';
	}

	// Cancel deletion
	function cancelDelete() {
		isDeleting = false;
		taskToDelete = '';
	}

	// Get human-readable label for cron expression
	function getCronLabel(cronExpression) {
		const match = schedules.find((option) => option.value === cronExpression);
		return match ? match.label : cronExpression;
	}

	onMount(() => {
		fetchScheduledTests();
		fetchSchedules(); // <-- also call this here
	});
</script>

<!-- Add/Modify modal -->
<dialog id="my_modal_1" class="modal" class:modal-open={isModalOpen}>
	<div class="modal-box">
		<div class="modal-header">
			<button class="btn btn-sm btn-circle z-10 absolute right-2 top-2" on:click={clearModal}>
				✖
			</button>
		</div>

		<h2 class="card-title mb-4">{isEditing ? 'Edit' : 'Add New'} Cron Job</h2>

		<form on:submit|preventDefault={saveCronJob} class="space-y-4">
			<div>
				<div for="taskName" class="label">
					<span class="label-text">Task Name</span>
					<span class="label-text-alt"
						>{isEditing
							? 'Name is used as ID. This cannot be changed.'
							: 'Use a meaningful name'}</span
					>
				</div>
				<input
					type="text"
					id="taskName"
					bind:value={taskName}
					class="input input-bordered w-full"
					placeholder="Task Name"
					required
					disabled={isEditing}
				/>
			</div>
			<div>
				<div for="cronExpression" class="label">
					<span class="label-text">Cron Expression</span>
					<span class="label-text-alt">You can use AI to construct your expression.</span>
				</div>
				<select
					id="cronExpression"
					bind:value={cronExpression}
					class="input input-bordered w-full"
					required
				>
					<option value="" disabled selected>Select Cron Expression</option>
					{#each schedules as schedule}
						<option value={schedule.value}>{schedule.label}</option>
					{/each}
				</select>
			</div>
			<div>
				<div for="tags" class="label">
					<span class="label-text">Tags</span>
					<span class="label-text-alt">If using multiple tags, "@test-1 or @test-2".</span>
				</div>
				<input
					type="text"
					id="tags"
					bind:value={tags}
					class="input input-bordered w-full"
					placeholder="Tags"
					required
				/>
			</div>
			<button type="submit" class="btn btn-success w-full">
				{isEditing ? 'Edit' : 'Add'} Cron Job
			</button>
		</form>
	</div>
</dialog>

<!-- Delete Confirmation Modal -->
<dialog id="delete_confirmation_modal" class="modal" class:modal-open={isDeleting}>
	<div class="modal-box">
		<h2 class="card-title mb-4">Are you sure you want to delete this cron job?</h2>
		<div class="flex justify-center gap-4">
			<button class="btn btn-error" on:click={confirmDelete}>Yes</button>
			<button class="btn" on:click={cancelDelete}>No</button>
		</div>
	</div>
</dialog>

<div class="flex justify-center items-center w-full my-4">
	<div class="card bg-base-300 rounded-box p-4">
		<div class="card-body text-left">
			<h2 class="card-title sticky top-0 bg-base-300 z-10">Scheduled Tests</h2>
			{#if successMessage}
				<div role="alert" class="alert alert-success z-0">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{successMessage}</span>
				</div>
			{/if}

			{#if errorMessage}
				<div role="alert" class="alert alert-error">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{errorMessage}</span>
				</div>
			{/if}
			<div class="mt-4">
				{#if scheduledTests.length > 0}
					<div class="overflow-x-auto">
						<table class="table table-zebra">
							<thead>
								<tr>
									<th>Name</th>
									<th>Frequency</th>
									<th>Tags</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody>
								{#each scheduledTests as scheduledTest}
									<tr>
										<td>{scheduledTest.taskName}</td>
										<td>{getCronLabel(scheduledTest.cronExpression)}</td>
										<td>{scheduledTest.tags}</td>
										<td>
											<button
												class="btn btn-warning btn-sm"
												on:click={() => openEditModal(scheduledTest)}
											>
												Edit
											</button>
											<button
												class="btn btn-error btn-sm"
												on:click={() => openDeleteConfirmation(scheduledTest.taskName)}
											>
												Delete
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p>No Scheduled Tests Available.</p>
				{/if}
			</div>
			<button class="btn mt-2" on:click={() => (isModalOpen = true)}>Add New Cron Job</button>
		</div>
	</div>
</div>
