<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import { activeProjectId, setProjects } from '$lib/stores/project';
	import { fetchAssignablePool } from '$lib/api/users';
	import {
		fetchProjects,
		fetchAllProjects,
		createProject,
		deleteProject,
		fetchProjectMembers,
		setProjectMembers
	} from '$lib/api/projects';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Paginator from '$lib/components/ui/Paginator.svelte';
	import { CANCEL_LABEL, SEARCH_PLACEHOLDER } from '$lib/copy/common';
	import {
		NEW_PROJECT_LABEL,
		NAME_LABEL,
		NEW_PROJECT_BASE_URL_LABEL,
		CREATE_PROJECT_LABEL,
		OTHER_PROJECTS_LABEL,
		DELETE_PROJECT_LABEL,
		projectRowMeta,
		DELETE_PROJECT_MODAL_TITLE,
		deleteProjectWarning,
		deleteProjectConfirmPrompt,
		DELETE_CONTINUE_LABEL,
		CONFIRM_DELETE_PROJECT_LABEL,
		PROJECT_MEMBERS_LABEL,
		PROJECT_MEMBERS_HINT,
		ROLE_PERMISSIONS_LINK,
		MANAGE_USERS_LINK,
		MEMBER_SEARCH_PLACEHOLDER,
		NO_MEMBERS_YET,
		REMOVE_MEMBER_TITLE,
		OWNER_MEMBER_TAG,
		ROLE_PERMISSIONS_MODAL_TITLE,
		ROLE_COLUMNS,
		ROLE_PERMISSION_ROWS
	} from '$lib/copy/settings';

	const PAGE_SIZE = 20;
	const PROJECT_PAGE_SIZE = 10;
	const nameMatch = (u, q) =>
		!q.trim() || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase());

	const dispatch = createEventDispatcher();
	let rolesOpen = false;

	$: isOwner = $auth.user?.role === 'owner';

	// ── Members of the active project ──
	let assignable = []; // every non-owner user
	let ownerRows = []; // shown read-only on every project — access is implicit
	let memberIds = [];
	let loadedFor = null;
	let query = '';

	let memberQuery = '';
	let memberPage = 0;

	$: members = assignable.filter((u) => memberIds.includes(u.id));
	$: filteredMembers = members.filter((u) => nameMatch(u, memberQuery));
	$: pagedMembers = filteredMembers.slice(memberPage * PAGE_SIZE, (memberPage + 1) * PAGE_SIZE);
	$: showMemberControls = members.length >= PAGE_SIZE;

	$: matches = query.trim()
		? assignable.filter((u) => !memberIds.includes(u.id) && nameMatch(u, query)).slice(0, PAGE_SIZE)
		: [];

	$: if ($activeProjectId && $activeProjectId !== loadedFor) loadMembers($activeProjectId);

	async function loadMembers(id) {
		loadedFor = id;
		try {
			const rows = await fetchProjectMembers(id);
			ownerRows = rows.filter((m) => m.role === 'owner');
			memberIds = rows.filter((m) => m.role !== 'owner').map((m) => m.id);
		} catch {
			ownerRows = [];
			memberIds = [];
		}
	}

	async function saveMemberIds() {
		await setProjectMembers($activeProjectId, memberIds);
		if (isOwner) loadAllProjects();
	}

	async function addMember(id) {
		query = '';
		memberIds = [...memberIds, id];
		await saveMemberIds();
	}

	async function removeMember(id) {
		memberIds = memberIds.filter((m) => m !== id);
		await saveMemberIds();
	}

	// ── Other projects (owner) ──
	let allProjects = [];
	let newName = '';
	let newBaseUrl = '';
	let creating = false;
	let createError = '';

	let deleteTarget = null;
	let deleteStep = 1; // 1 = irreversible warning, 2 = type the id
	let deleteInput = '';
	let deleting = false;
	let deleteError = '';

	let projQuery = '';
	let projPage = 0;
	$: filteredProjects = allProjects.filter(
		(p) => !projQuery.trim() || p.name.toLowerCase().includes(projQuery.trim().toLowerCase())
	);
	$: pagedProjects = filteredProjects.slice(
		projPage * PROJECT_PAGE_SIZE,
		(projPage + 1) * PROJECT_PAGE_SIZE
	);

	onMount(async () => {
		try {
			assignable = await fetchAssignablePool();
		} catch {}
		if (isOwner) await loadAllProjects();
	});

	async function loadAllProjects() {
		try {
			allProjects = await fetchAllProjects();
		} catch {}
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		creating = true;
		createError = '';
		try {
			await createProject({ name: newName.trim(), baseUrl: newBaseUrl.trim() });
			setProjects(await fetchProjects());
			await loadAllProjects();
			newName = '';
			newBaseUrl = '';
		} catch (e) {
			createError = e.message;
		} finally {
			creating = false;
		}
	}

	function openDelete(project) {
		deleteTarget = project;
		deleteStep = 1;
		deleteInput = '';
		deleteError = '';
	}

	async function confirmDelete() {
		deleting = true;
		deleteError = '';
		try {
			const wasActive = deleteTarget.id === $activeProjectId;
			await deleteProject(deleteTarget.id);
			setProjects(await fetchProjects());
			deleteTarget = null;
			// Every page is scoped to the active project — reload so it re-resolves.
			if (wasActive) return window.location.reload();
			await loadAllProjects();
		} catch (e) {
			deleteError = e.message;
		} finally {
			deleting = false;
		}
	}
</script>

{#if isOwner}
	<div class="card">
		<p class="card-title">{OTHER_PROJECTS_LABEL}</p>

		<section>
			<h4>{NEW_PROJECT_LABEL}</h4>
			<div class="new-row">
				<input class="field-input" bind:value={newName} placeholder={NAME_LABEL} />
				<input
					class="field-input"
					bind:value={newBaseUrl}
					placeholder={NEW_PROJECT_BASE_URL_LABEL}
				/>
				<Button on:click={handleCreate} disabled={creating || !newName.trim()}>
					{CREATE_PROJECT_LABEL}
				</Button>
			</div>
			{#if createError}<p class="error">{createError}</p>{/if}
		</section>

		<section>
			<h4>{OTHER_PROJECTS_LABEL}</h4>
			{#if allProjects.length > 1}
				<input
					class="field-input"
					bind:value={projQuery}
					placeholder={SEARCH_PLACEHOLDER}
					on:input={() => (projPage = 0)}
				/>
			{/if}
			{#each pagedProjects as p (p.id)}
				<div class="project-row">
					<span class="p-name">{p.name}</span>
					<span class="p-meta">{projectRowMeta(p.slug, p.memberCount ?? 0)}</span>
					<button class="danger-link" on:click={() => openDelete(p)}>{DELETE_PROJECT_LABEL}</button>
				</div>
			{/each}
			<Paginator bind:page={projPage} total={filteredProjects.length} perPage={PROJECT_PAGE_SIZE} />
		</section>
	</div>
{/if}

<div class="card">
	<p class="card-title">{PROJECT_MEMBERS_LABEL}</p>
	<p class="hint">{PROJECT_MEMBERS_HINT}</p>
	<div class="links">
		<button class="link" on:click={() => (rolesOpen = true)}>{ROLE_PERMISSIONS_LINK}</button>
		{#if isOwner}
			<button class="link" on:click={() => dispatch('navigate', 'users')}
				>{MANAGE_USERS_LINK}</button
			>
		{/if}
	</div>

	<div class="search-wrap">
		<input class="field-input" bind:value={query} placeholder={MEMBER_SEARCH_PLACEHOLDER} />
		{#if matches.length > 0}
			<ul class="results">
				{#each matches as u (u.id)}
					<li>
						<button on:click={() => addMember(u.id)}>
							<span>{u.name}</span>
							<span class="role">{u.role}</span>
							<span class="email">{u.email}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if showMemberControls}
		<input
			class="field-input"
			bind:value={memberQuery}
			placeholder={SEARCH_PLACEHOLDER}
			on:input={() => (memberPage = 0)}
		/>
	{/if}
	<ul class="members">
		{#each ownerRows as o (o.id)}
			<li>
				<span>{o.name}</span>
				<span class="role">{o.role}</span>
				<span class="email">{o.email}</span>
				<span class="owner-tag">{OWNER_MEMBER_TAG}</span>
			</li>
		{/each}
		{#each pagedMembers as u (u.id)}
			<li>
				<span>{u.name}</span>
				<span class="role">{u.role}</span>
				<span class="email">{u.email}</span>
				<button class="remove" title={REMOVE_MEMBER_TITLE} on:click={() => removeMember(u.id)}>
					×
				</button>
			</li>
		{/each}
	</ul>
	{#if members.length === 0}
		<p class="hint">{NO_MEMBERS_YET}</p>
	{:else}
		<Paginator bind:page={memberPage} total={filteredMembers.length} perPage={PAGE_SIZE} />
	{/if}
</div>

<Modal bind:open={deleteTarget} title={DELETE_PROJECT_MODAL_TITLE}>
	{#if deleteTarget && deleteStep === 1}
		<p class="warn">{deleteProjectWarning(deleteTarget.name)}</p>
		<div class="modal-actions">
			<button class="btn-danger" on:click={() => (deleteStep = 2)}>
				{DELETE_CONTINUE_LABEL}
			</button>
			<button class="btn-cancel" on:click={() => (deleteTarget = null)}>{CANCEL_LABEL}</button>
		</div>
	{:else if deleteTarget}
		<label class="confirm-label" for="delete-confirm">
			{deleteProjectConfirmPrompt(deleteTarget.slug)}
		</label>
		<input id="delete-confirm" class="field-input" bind:value={deleteInput} autocomplete="off" />
		{#if deleteError}<p class="error">{deleteError}</p>{/if}
		<div class="modal-actions">
			<button
				class="btn-danger"
				disabled={deleting || deleteInput.trim() !== deleteTarget.slug}
				on:click={confirmDelete}
			>
				{CONFIRM_DELETE_PROJECT_LABEL}
			</button>
			<button class="btn-cancel" disabled={deleting} on:click={() => (deleteTarget = null)}>
				{CANCEL_LABEL}
			</button>
		</div>
	{/if}
</Modal>

<Modal bind:open={rolesOpen} title={ROLE_PERMISSIONS_MODAL_TITLE}>
	<table class="roles">
		<thead>
			<tr>
				<th></th>
				{#each ROLE_COLUMNS as c}<th>{c}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each ROLE_PERMISSION_ROWS as row}
				<tr>
					<td>{row.label}</td>
					{#each row.cells as cell}<td class="cell">{cell}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</Modal>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.25rem;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	h4 {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text);
	}
	.hint {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.links {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.link {
		padding: 0;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
	}
	.link:hover {
		text-decoration: underline;
	}
	.roles {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	.roles th,
	.roles td {
		padding: 0.4rem 0.6rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}
	.roles th {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.roles td {
		color: var(--text);
	}
	.roles .cell {
		color: var(--text-muted);
		white-space: nowrap;
	}
	.error {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: var(--fail);
	}

	@media (max-width: 560px) {
		.roles {
			font-size: 0.72rem;
		}
		.roles th,
		.roles td {
			padding: 0.35rem 0.4rem;
		}
		.roles .cell {
			white-space: normal;
		}
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

	.project-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
	}
	.p-name {
		font-weight: 500;
		color: var(--text);
	}
	.p-meta {
		flex: 1;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.danger-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--fail);
		cursor: pointer;
	}
	.danger-link:hover {
		text-decoration: underline;
	}

	.search-wrap {
		position: relative;
	}
	.results {
		/* The members card sits at the bottom of the page above the fixed run bar,
		   so the list opens upward to stay clear of it. */
		position: absolute;
		z-index: 5;
		bottom: calc(100% + 2px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
		max-height: 240px;
		overflow-y: auto;
	}
	.results button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		font: inherit;
		font-size: 0.82rem;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}
	.results button:hover {
		background: var(--bg-subtle);
	}

	.members {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.members li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--text);
	}
	.role {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent);
	}
	.email {
		flex: 1;
		font-size: 0.78rem;
		color: var(--text-muted);
	}
	.owner-tag {
		flex-shrink: 0;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.remove {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
		line-height: 1;
		color: var(--text-muted);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.remove:hover {
		color: var(--fail);
		border-color: var(--fail);
	}

	.warn {
		margin: 0 0 1rem;
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--text);
	}
	.confirm-label {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}
	.modal-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
	.btn-danger {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--white);
		background: var(--fail);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-cancel {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
</style>
