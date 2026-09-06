<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import { notify } from '$lib/stores/notifications';
	import { copyText } from '$lib/utils/clipboard';
	import { COPY_TIMEOUT_MS, SESSION_TIMEOUT_OPTIONS } from '$lib/constants';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Paginator from '$lib/components/ui/Paginator.svelte';
	import {
		fetchUsers,
		fetchResettableUsers,
		createUser as createUserApi,
		resetUserPassword as resetUserPasswordApi,
		deleteUser as deleteUserApi
	} from '$lib/api/users';
	import { fetchOrganization, saveOrganization } from '$lib/api/settings';
	import { EMAIL_LABEL, SEARCH_PLACEHOLDER } from '$lib/copy/common';
	import {
		NAME_LABEL,
		USERS_LABEL,
		USERS_DESC,
		USERS_ADMIN_DESC,
		MANAGE_PROJECTS_LINK_LABEL,
		REMOVE_USER_MODAL_TITLE,
		REMOVE_USER_LABEL,
		REMOVE_USER_BODY_PREFIX,
		REMOVE_USER_BODY_SUFFIX,
		ADD_USER_CARD_TITLE,
		ALL_USERS_CARD_TITLE,
		USERS_ADMIN_CARD_TITLE,
		USER_NAME_PLACEHOLDER,
		USER_EMAIL_PLACEHOLDER,
		PASSWORD_LABEL,
		ROLE_LABEL,
		USER_ROLE_OPTION,
		ADMIN_ROLE_OPTION,
		OWNER_ROLE_OPTION,
		REMOVE_USER_ICON_TITLE,
		RESET_PASSWORD_ICON_TITLE,
		RESET_PASSWORD_MODAL_TITLE,
		RESET_PASSWORD_BODY_PREFIX,
		RESET_PASSWORD_BODY_SUFFIX,
		RESET_PASSWORD_RESULT_TITLE,
		RESET_PASSWORD_RESULT_DESC,
		RESET_PASSWORD_COPY_TITLE,
		RESET_PASSWORD_COPIED_TITLE,
		RESET_PASSWORD_DONE_LABEL,
		YOU_CHIP_LABEL,
		USER_FORM_REQUIRED_ERROR,
		USER_PROJECTS_LABEL,
		USER_NO_PROJECTS,
		USER_ALL_PROJECTS,
		ORG_CARD_TITLE,
		ORG_NAME_LABEL,
		ORG_NAME_PLACEHOLDER,
		ORG_LOGO_URL_LABEL,
		ORG_LOGO_URL_PLACEHOLDER,
		SESSION_TIMEOUT_LABEL,
		SESSION_TIMEOUT_HINT,
		ORG_SAVED_TOAST,
		addUserLabel,
		resetPasswordLabel,
		passwordResetToast,
		saveOrgLabel,
		sessionTimeoutOptionLabel,
		userAddedToast,
		userRemovedToast
	} from '$lib/copy/settings';

	const dispatch = createEventDispatcher();
	const USERS_PER_PAGE = 20;

	$: role = $auth.user?.role;
	$: isOwner = role === 'owner';
	// owner may reset admins and users; admin may reset users only.
	const RESETTABLE_BY = { owner: ['admin', 'user'], admin: ['user'] };
	$: canReset = (targetRole) => (RESETTABLE_BY[role] ?? []).includes(targetRole);

	let allUsers = [];
	let userQuery = '';
	let userPage = 0;
	let expandedUserId = null;
	let userForm = { name: '', email: '', password: '', role: 'user' };
	let userFormSaving = false;
	let userFormError = '';
	let confirmDeleteUser = null;
	let confirmDeleteUserOpen = false;
	let confirmResetUser = null;
	let confirmResetOpen = false;
	let resetting = false;
	let resetResult = null;
	let resetResultOpen = false;
	let tempPasswordCopied = false;

	let orgForm = { name: '', logoUrl: '', sessionMaxHours: SESSION_TIMEOUT_OPTIONS.at(-1) };
	let orgSaving = false;

	$: if (!resetResultOpen) resetResult = null;

	$: filteredUsers = allUsers.filter(
		(u) =>
			!userQuery.trim() ||
			`${u.name} ${u.email}`.toLowerCase().includes(userQuery.trim().toLowerCase())
	);
	$: pagedUsers = filteredUsers.slice(userPage * USERS_PER_PAGE, (userPage + 1) * USERS_PER_PAGE);

	onMount(async () => {
		try {
			allUsers = isOwner ? await fetchUsers() : await fetchResettableUsers();
		} catch {}
		if (isOwner) {
			try {
				orgForm = await fetchOrganization();
			} catch {}
		}
	});

	async function handleSaveOrg() {
		orgSaving = true;
		try {
			orgForm = await saveOrganization(orgForm);
			notify('success', ORG_SAVED_TOAST);
		} catch (e) {
			notify('error', e.message);
		} finally {
			orgSaving = false;
		}
	}

	async function handleCreateUser() {
		userFormError = '';
		if (!userForm.name || !userForm.email || !userForm.password) {
			userFormError = USER_FORM_REQUIRED_ERROR;
			return;
		}
		userFormSaving = true;
		try {
			const user = await createUserApi(userForm);
			allUsers = [...allUsers, user];
			userForm = { name: '', email: '', password: '', role: 'user' };
			notify('success', userAddedToast(user.name));
		} catch (e) {
			userFormError = e.message;
		} finally {
			userFormSaving = false;
		}
	}

	async function handleResetPassword(user) {
		resetting = true;
		try {
			const tempPassword = await resetUserPasswordApi(user.id);
			resetResult = { name: user.name, tempPassword };
			resetResultOpen = true;
			tempPasswordCopied = false;
			notify('success', passwordResetToast(user.name));
		} catch (e) {
			notify('error', e.message);
		} finally {
			resetting = false;
			confirmResetUser = null;
			confirmResetOpen = false;
		}
	}

	async function copyTempPassword() {
		if (!resetResult) return;
		await copyText(resetResult.tempPassword);
		tempPasswordCopied = true;
		setTimeout(() => (tempPasswordCopied = false), COPY_TIMEOUT_MS);
	}

	async function handleDeleteUser(id, name) {
		try {
			await deleteUserApi(id);
			allUsers = allUsers.filter((u) => u.id !== id);
			notify('success', userRemovedToast(name));
		} catch (e) {
			notify('error', e.message);
		}
		confirmDeleteUser = null;
		confirmDeleteUserOpen = false;
	}
</script>

<div class="content-header">
	<h2>{USERS_LABEL}</h2>
	<p class="content-desc">{isOwner ? USERS_DESC : USERS_ADMIN_DESC}</p>
	{#if isOwner}
		<button class="content-link" on:click={() => dispatch('navigate', 'project')}>
			{MANAGE_PROJECTS_LINK_LABEL}
		</button>
	{/if}
</div>

<ConfirmModal
	bind:open={confirmDeleteUserOpen}
	title={REMOVE_USER_MODAL_TITLE}
	confirmLabel={REMOVE_USER_LABEL}
	on:confirm={() => handleDeleteUser(confirmDeleteUser?.id, confirmDeleteUser?.name)}
>
	{#if confirmDeleteUser}
		{REMOVE_USER_BODY_PREFIX}
		<strong>{confirmDeleteUser.name}</strong>{REMOVE_USER_BODY_SUFFIX}
	{/if}
</ConfirmModal>

<ConfirmModal
	bind:open={confirmResetOpen}
	title={RESET_PASSWORD_MODAL_TITLE}
	confirmLabel={resetPasswordLabel(resetting)}
	loading={resetting}
	on:confirm={() => confirmResetUser && handleResetPassword(confirmResetUser)}
>
	{#if confirmResetUser}
		{RESET_PASSWORD_BODY_PREFIX}
		<strong>{confirmResetUser.name}</strong>{RESET_PASSWORD_BODY_SUFFIX}
	{/if}
</ConfirmModal>

<Modal bind:open={resetResultOpen} title={RESET_PASSWORD_RESULT_TITLE}>
	{#if resetResult}
		<p class="reset-result-desc">{RESET_PASSWORD_RESULT_DESC}</p>
		<div class="reset-result-row">
			<input class="field-input" value={resetResult.tempPassword} readonly spellcheck="false" />
			<button class="reset-copy-btn" on:click={copyTempPassword}>
				{tempPasswordCopied ? RESET_PASSWORD_COPIED_TITLE : RESET_PASSWORD_COPY_TITLE}
			</button>
		</div>
		<div class="reset-result-actions">
			<Button on:click={() => (resetResultOpen = false)}>{RESET_PASSWORD_DONE_LABEL}</Button>
		</div>
	{/if}
</Modal>

{#if isOwner}
	<div class="card settings-card">
		<p class="card-title">{ORG_CARD_TITLE}</p>
		<div class="field-row">
			<div class="field">
				<label class="field-label" for="org-name">{ORG_NAME_LABEL}</label>
				<input
					id="org-name"
					type="text"
					class="field-input"
					bind:value={orgForm.name}
					placeholder={ORG_NAME_PLACEHOLDER}
				/>
			</div>
			<div class="field">
				<label class="field-label" for="org-logo">{ORG_LOGO_URL_LABEL}</label>
				<input
					id="org-logo"
					type="url"
					class="field-input"
					bind:value={orgForm.logoUrl}
					placeholder={ORG_LOGO_URL_PLACEHOLDER}
				/>
			</div>
		</div>
		<div class="field field-sm">
			<label class="field-label" for="org-session">{SESSION_TIMEOUT_LABEL}</label>
			<select id="org-session" class="field-input" bind:value={orgForm.sessionMaxHours}>
				{#each SESSION_TIMEOUT_OPTIONS as hours (hours)}
					<option value={hours}>{sessionTimeoutOptionLabel(hours)}</option>
				{/each}
			</select>
			<p class="field-hint">{SESSION_TIMEOUT_HINT}</p>
		</div>
		<div class="card-footer">
			<Button on:click={handleSaveOrg} disabled={orgSaving}>
				{saveOrgLabel(orgSaving)}
			</Button>
		</div>
	</div>

	<div class="card settings-card">
		<p class="card-title">{ADD_USER_CARD_TITLE}</p>
		<div class="field-row">
			<div class="field">
				<label class="field-label" for="u-name">{NAME_LABEL}</label>
				<input
					id="u-name"
					type="text"
					class="field-input"
					bind:value={userForm.name}
					placeholder={USER_NAME_PLACEHOLDER}
				/>
			</div>
			<div class="field">
				<label class="field-label" for="u-email">{EMAIL_LABEL}</label>
				<input
					id="u-email"
					type="email"
					class="field-input"
					bind:value={userForm.email}
					placeholder={USER_EMAIL_PLACEHOLDER}
				/>
			</div>
		</div>
		<div class="field-row">
			<div class="field">
				<label class="field-label" for="u-pw">{PASSWORD_LABEL}</label>
				<input
					id="u-pw"
					type="password"
					class="field-input"
					bind:value={userForm.password}
					autocomplete="new-password"
				/>
			</div>
			<div class="field">
				<label class="field-label" for="u-role">{ROLE_LABEL}</label>
				<select id="u-role" class="field-input" bind:value={userForm.role}>
					<option value="user">{USER_ROLE_OPTION}</option>
					<option value="admin">{ADMIN_ROLE_OPTION}</option>
					<option value="owner">{OWNER_ROLE_OPTION}</option>
				</select>
			</div>
		</div>
		{#if userFormError}<p class="form-error">{userFormError}</p>{/if}
		<div class="card-footer">
			<Button
				on:click={handleCreateUser}
				disabled={userFormSaving ||
					!userForm.name.trim() ||
					!userForm.email.trim() ||
					!userForm.password}
			>
				{addUserLabel(userFormSaving)}
			</Button>
		</div>
	</div>
{/if}

{#if allUsers.length > 0}
	<div class="card settings-card">
		<p class="card-title">{isOwner ? ALL_USERS_CARD_TITLE : USERS_ADMIN_CARD_TITLE}</p>
		{#if allUsers.length > 1}
			<input
				class="field-input user-search"
				bind:value={userQuery}
				placeholder={SEARCH_PLACEHOLDER}
				on:input={() => (userPage = 0)}
			/>
		{/if}
		<div class="users-table">
			{#each pagedUsers as u (u.id)}
				<div class="user-row" class:expanded={isOwner && expandedUserId === u.id}>
					<div class="user-row-head">
						{#if isOwner}
							<button
								class="user-info"
								aria-expanded={expandedUserId === u.id}
								on:click={() => (expandedUserId = expandedUserId === u.id ? null : u.id)}
							>
								<span class="user-name">{u.name}</span>
								<span class="user-email">{u.email}</span>
							</button>
						{:else}
							<div class="user-info">
								<span class="user-name">{u.name}</span>
								<span class="user-email">{u.email}</span>
							</div>
						{/if}
						<span class="role-chip {u.role}">{u.role}</span>
						{#if canReset(u.role)}
							<button
								class="icon-btn"
								title={RESET_PASSWORD_ICON_TITLE}
								on:click={() => {
									confirmResetUser = u;
									confirmResetOpen = true;
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
									<path
										d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
									/><circle cx="16.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
								</svg>
							</button>
						{/if}
						{#if isOwner}
							{#if u.id !== $auth.user?.id}
								<button
									class="icon-btn danger"
									title={REMOVE_USER_ICON_TITLE}
									on:click={() => {
										confirmDeleteUser = { id: u.id, name: u.name };
										confirmDeleteUserOpen = true;
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
							{:else}
								<span class="you-chip">{YOU_CHIP_LABEL}</span>
							{/if}
						{/if}
					</div>
					{#if isOwner && expandedUserId === u.id}
						<div class="user-projects">
							<p class="user-projects-label">{USER_PROJECTS_LABEL}</p>
							{#if u.role === 'owner'}
								<p class="user-projects-hint">{USER_ALL_PROJECTS}</p>
							{:else if (u.projects ?? []).length === 0}
								<p class="user-projects-hint">{USER_NO_PROJECTS}</p>
							{:else}
								<ul class="user-project-list">
									{#each u.projects as p (p.id)}
										<li><span>{p.name}</span><span class="slug">{p.slug}</span></li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<Paginator bind:page={userPage} total={filteredUsers.length} perPage={USERS_PER_PAGE} />
	</div>
{/if}

<style>
	.content-header {
		margin-bottom: 0.25rem;
	}
	.content-header h2 {
		font-size: 1.1rem;
		font-weight: 500;
		font-family: var(--font-body);
		color: var(--text);
		margin-bottom: 0.25rem;
	}
	.content-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.field-label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.field-sm {
		max-width: 220px;
	}
	.field-hint {
		margin: 0.125rem 0 0;
		line-height: 1.5;
	}
	.card-footer {
		padding-top: 0.5rem;
	}
	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}
	.content-link {
		display: inline-block;
		margin-top: 0.5rem;
		padding: 0;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
	}
	.content-link:hover {
		text-decoration: underline;
	}

	.user-search {
		margin-top: 1rem;
	}
	.users-table {
		display: flex;
		flex-direction: column;
		margin-top: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.user-row:not(:last-child) {
		border-bottom: 1px solid var(--border);
	}
	.user-row.expanded {
		background: var(--bg-subtle);
	}
	.user-row-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
	}
	.user-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0;
		font: inherit;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
	}
	.user-projects {
		margin: 0 1rem;
		padding: 0.75rem 0;
		border-top: 1px solid var(--border);
	}
	.user-projects-label {
		margin: 0 0 0.4rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.user-projects-hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-muted);
	}
	.user-project-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.user-project-list li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--text);
	}
	.user-project-list .slug {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.user-name {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text);
	}
	.user-email {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.role-chip {
		font-size: 0.7rem;
		font-weight: 500;
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
		flex-shrink: 0;
	}
	.role-chip.owner,
	.role-chip.admin {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.role-chip.owner {
		font-weight: 700;
	}
	.role-chip.user {
		background: var(--bg-subtle);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}
	.you-chip {
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
		flex-shrink: 0;
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
		flex-shrink: 0;
	}
	.icon-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}
	.icon-btn.danger:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}

	.reset-result-desc {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.reset-result-row {
		display: flex;
		gap: 0.5rem;
	}
	.reset-result-row .field-input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
	}
	.reset-copy-btn {
		flex-shrink: 0;
		padding: 0 0.85rem;
		font: inherit;
		font-size: 0.8125rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		cursor: pointer;
		transition: background var(--duration-fast);
	}
	.reset-copy-btn:hover {
		background: var(--bg-elevated);
	}
	.reset-result-actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 640px) {
		.field-row {
			grid-template-columns: 1fr;
		}
	}
</style>
