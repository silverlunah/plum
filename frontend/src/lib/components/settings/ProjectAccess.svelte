<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import { activeProjectId, setProjects } from '$lib/stores/project';
	import { fetchMembers } from '$lib/api/repository';
	import {
		fetchProjects,
		createProject,
		fetchProjectMembers,
		setProjectMembers
	} from '$lib/api/projects';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		NEW_PROJECT_LABEL,
		NAME_LABEL,
		NEW_PROJECT_BASE_URL_LABEL,
		CREATE_PROJECT_LABEL,
		PROJECT_MEMBERS_LABEL,
		SAVE_MEMBERS_LABEL,
		PROJECT_MEMBERS_HINT
	} from '$lib/copy/settings';

	$: isOwner = $auth.user?.role === 'owner';

	let assignable = [];
	let memberIds = new Set();
	let loadedFor = null;
	let savingMembers = false;

	let newName = '';
	let newBaseUrl = '';
	let creating = false;
	let error = '';

	onMount(async () => {
		try {
			assignable = await fetchMembers();
		} catch {}
	});

	// Reload the checklist whenever the active project changes.
	$: if ($activeProjectId && $activeProjectId !== loadedFor) loadMembers($activeProjectId);

	async function loadMembers(id) {
		loadedFor = id;
		try {
			memberIds = new Set((await fetchProjectMembers(id)).map((m) => m.userId));
		} catch {
			memberIds = new Set();
		}
	}

	function toggle(id) {
		if (memberIds.has(id)) memberIds.delete(id);
		else memberIds.add(id);
		memberIds = memberIds;
	}

	async function saveMembers() {
		savingMembers = true;
		try {
			await setProjectMembers($activeProjectId, [...memberIds]);
		} finally {
			savingMembers = false;
		}
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		creating = true;
		error = '';
		try {
			await createProject({ name: newName.trim(), baseUrl: newBaseUrl.trim() });
			setProjects(await fetchProjects());
			newName = '';
			newBaseUrl = '';
		} catch (e) {
			error = e.message;
		} finally {
			creating = false;
		}
	}
</script>

{#if isOwner}
	<div class="card settings-card">
		<p class="card-title">{NEW_PROJECT_LABEL}</p>
		<div class="new-row">
			<input class="field-input" bind:value={newName} placeholder={NAME_LABEL} />
			<input class="field-input" bind:value={newBaseUrl} placeholder={NEW_PROJECT_BASE_URL_LABEL} />
			<Button on:click={handleCreate} disabled={creating || !newName.trim()}>
				{CREATE_PROJECT_LABEL}
			</Button>
		</div>
		{#if error}<p class="error">{error}</p>{/if}
	</div>
{/if}

<div class="card settings-card">
	<p class="card-title">{PROJECT_MEMBERS_LABEL}</p>
	<p class="hint">{PROJECT_MEMBERS_HINT}</p>
	{#each assignable as u (u.id)}
		<label class="member">
			<input type="checkbox" checked={memberIds.has(u.id)} on:change={() => toggle(u.id)} />
			<span>{u.name}</span>
			<span class="role">{u.role}</span>
			<span class="email">{u.email}</span>
		</label>
	{/each}
	<div class="card-footer">
		<Button on:click={saveMembers} disabled={savingMembers}>{SAVE_MEMBERS_LABEL}</Button>
	</div>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.25rem;
	}
	.hint {
		margin: 0 0 0.5rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.error {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: var(--fail);
	}
	.new-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.new-row .field-input {
		flex: 1;
		min-width: 160px;
	}
	.member {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		font-size: 0.85rem;
		color: var(--text);
	}
	.member .role {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent);
	}
	.member .email {
		margin-left: auto;
		font-size: 0.78rem;
		color: var(--text-muted);
	}
</style>
