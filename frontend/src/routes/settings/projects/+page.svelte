<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth';
	import { fetchUsers } from '$lib/api/users';
	import {
		fetchAllProjects,
		createProject,
		fetchProjectMembers,
		setProjectMembers
	} from '$lib/api/projects';
	import BackLink from '$lib/components/ui/BackLink.svelte';
	import {
		PROJECTS_TITLE,
		PROJECTS_SUBTITLE,
		NEW_PROJECT_LABEL,
		NAME_LABEL,
		NEW_PROJECT_BASE_URL_LABEL,
		CREATE_PROJECT_LABEL,
		PROJECT_MEMBERS_LABEL,
		SAVE_MEMBERS_LABEL,
		PROJECT_ADMINS_ALL_HINT
	} from '$lib/copy/settings';

	let projects = [];
	let users = [];
	let newName = '';
	let newBaseUrl = '';
	let creating = false;
	let error = '';

	let expanded = null;
	let memberIds = new Set();
	let savingMembers = false;

	onMount(async () => {
		if ($auth.user?.role !== 'admin') {
			goto('/settings');
			return;
		}
		[projects, users] = await Promise.all([fetchAllProjects(), fetchUsers()]);
	});

	async function handleCreate() {
		if (!newName.trim()) return;
		creating = true;
		error = '';
		try {
			await createProject({ name: newName.trim(), baseUrl: newBaseUrl.trim() });
			projects = await fetchAllProjects();
			newName = '';
			newBaseUrl = '';
		} catch (e) {
			error = e.message;
		} finally {
			creating = false;
		}
	}

	async function toggleMembers(project) {
		if (expanded === project.id) {
			expanded = null;
			return;
		}
		expanded = project.id;
		const members = await fetchProjectMembers(project.id);
		memberIds = new Set(members.map((m) => m.userId));
	}

	function toggleUser(id) {
		if (memberIds.has(id)) memberIds.delete(id);
		else memberIds.add(id);
		memberIds = memberIds;
	}

	async function saveMembers(projectId) {
		savingMembers = true;
		try {
			await setProjectMembers(projectId, [...memberIds]);
			projects = await fetchAllProjects();
		} finally {
			savingMembers = false;
		}
	}
</script>

<svelte:head><title>{PROJECTS_TITLE} — Plum</title></svelte:head>

<div class="wrap">
	<BackLink href="/settings" label="Settings" />
	<h1>{PROJECTS_TITLE}</h1>
	<p class="subtitle">{PROJECTS_SUBTITLE}</p>

	<section class="card">
		<h2>{NEW_PROJECT_LABEL}</h2>
		<div class="new-row">
			<input class="input" bind:value={newName} placeholder={NAME_LABEL} />
			<input class="input" bind:value={newBaseUrl} placeholder={NEW_PROJECT_BASE_URL_LABEL} />
			<button class="btn" on:click={handleCreate} disabled={creating || !newName.trim()}>
				{CREATE_PROJECT_LABEL}
			</button>
		</div>
		{#if error}<p class="error">{error}</p>{/if}
	</section>

	<div class="list">
		{#each projects as p (p.id)}
			<div class="project-row">
				<button class="project-head" on:click={() => toggleMembers(p)}>
					<span class="project-name">{p.name}</span>
					<span class="project-meta">{p.slug} · {p._count?.members ?? 0} members</span>
				</button>

				{#if expanded === p.id}
					<div class="members">
						<span class="members-label">{PROJECT_MEMBERS_LABEL}</span>
						<p class="hint">{PROJECT_ADMINS_ALL_HINT}</p>
						{#each users.filter((u) => u.role !== 'admin') as u (u.id)}
							<label class="member">
								<input
									type="checkbox"
									checked={memberIds.has(u.id)}
									on:change={() => toggleUser(u.id)}
								/>
								{u.name} <span class="member-email">{u.email}</span>
							</label>
						{/each}
						<button class="btn" on:click={() => saveMembers(p.id)} disabled={savingMembers}>
							{SAVE_MEMBERS_LABEL}
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.wrap {
		max-width: 720px;
		margin: 0 auto;
		padding: 1.5rem;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0.75rem 0 0.25rem;
	}
	.subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0 0 1.5rem;
	}
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}
	h2 {
		font-size: 0.95rem;
		margin: 0 0 0.75rem;
	}
	.new-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.input {
		flex: 1;
		min-width: 140px;
		height: 36px;
		padding: 0 0.6rem;
		font-family: var(--font-body);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.btn {
		height: 36px;
		padding: 0 1rem;
		background: var(--accent);
		color: var(--white);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.error {
		color: var(--fail);
		font-size: 0.8rem;
		margin: 0.5rem 0 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.project-row {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		overflow: hidden;
	}
	.project-head {
		width: 100%;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}
	.project-name {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text);
	}
	.project-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
	}
	.members {
		border-top: 1px solid var(--border);
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background: var(--bg-subtle);
	}
	.members-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	.hint {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0 0 0.25rem;
	}
	.member {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--text);
	}
	.member-email {
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.members .btn {
		margin-top: 0.5rem;
		align-self: flex-start;
	}
</style>
