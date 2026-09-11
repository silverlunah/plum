<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import { fetchProjects } from '$lib/api/projects';
	import { branding, loadBranding } from '$lib/stores/branding';
	import { activeProjectId, activeProject, projects, setProjects } from '$lib/stores/project';
	import {
		notificationInbox,
		unreadNotificationCount,
		loadNotificationInbox,
		markInboxRead,
		markInboxAllRead
	} from '$lib/stores/notificationInbox';
	import {
		NOTIFICATIONS_LABEL,
		NO_NOTIFICATIONS_MESSAGE,
		MARK_ALL_READ_LABEL,
		unreadCountBadge
	} from '$lib/copy/notifications';

	let menuOpen = false;
	let projectMenuOpen = false;
	let notifOpen = false;

	function handleNotificationClick(n) {
		notifOpen = false;
		if (!n.read) markInboxRead(n.id);
	}

	// Shared store, so a project created or deleted in Settings shows here without a reload.
	$: projectList = $projects;

	onMount(async () => {
		try {
			setProjects(await fetchProjects());
		} catch {}
		loadBranding();
		loadNotificationInbox().catch(() => {});
	});

	function switchProject(id) {
		projectMenuOpen = false;
		if (id === $activeProjectId) return;
		activeProjectId.set(id);
		// Every page's data is scoped by the header, reload so it all refetches.
		window.location.reload();
	}

	const AUTOMATION_LINKS = [
		{ href: '/automated-tests', label: 'Automated Tests' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/scheduled-tests', label: 'Scheduled' }
	];
	const REPO_LINK = { href: '/test-repository', label: 'Test Repository' };
	const AI_LINK = { href: '/ai', label: 'AI', sep: true };

	// Manual-only hides the automation surface entirely. Otherwise `sep` just
	// draws a divider between the Test Repository link and the automation group,
	// on whichever side the repository sits.
	$: manualOnly = $activeProject?.manualRepositoryOnly ?? false;
	$: repoFirst = manualOnly || $activeProject?.defaultHome === 'repository';
	$: links = [
		...(manualOnly
			? [REPO_LINK]
			: repoFirst
				? [REPO_LINK, { ...AUTOMATION_LINKS[0], sep: true }, ...AUTOMATION_LINKS.slice(1)]
				: [...AUTOMATION_LINKS, { ...REPO_LINK, sep: true }]),
		AI_LINK
	];

	function closeMenu() {
		menuOpen = false;
	}
</script>

<nav class="nav">
	<div class="inner">
		<a href="/" class="brand" on:click={closeMenu}>
			{#if $branding?.logoUrl}
				<img
					class="brand-logo"
					src={$branding.logoUrl}
					alt={$branding.name || 'Home'}
					on:error={(e) => (e.currentTarget.hidden = true)}
					on:load={(e) => (e.currentTarget.hidden = false)}
				/>
			{:else}
				<span class="brand-serif">Pl</span><span class="brand-sans">um</span>
			{/if}
		</a>

		<div class="links">
			{#each links as link}
				{#if link.sep}
					<span class="nav-sep" aria-hidden="true"></span>
				{/if}
				<a
					href={link.href}
					class="link"
					class:active={$page.url.pathname === link.href ||
						$page.url.pathname.startsWith(link.href + '/')}
				>
					{link.label}
				</a>
			{/each}
		</div>

		<div class="actions">
			{#if projectList.length > 0 && $activeProject}
				<div class="project-switcher">
					<button
						class="project-trigger"
						on:click={() => (projectMenuOpen = !projectMenuOpen)}
						aria-haspopup="listbox"
						aria-expanded={projectMenuOpen}
					>
						{#if $activeProject.logoUrl}
							<img src={$activeProject.logoUrl} alt="" class="project-logo" />
						{:else}
							<span class="project-logo project-logo-fallback">{$activeProject.name[0]}</span>
						{/if}
						<span class="project-name">{$activeProject.name}</span>
						<svg
							class="chevron"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
						>
					</button>
					{#if projectMenuOpen}
						<button
							class="project-backdrop"
							on:click={() => (projectMenuOpen = false)}
							tabindex="-1"
							aria-label="Close"
						></button>
						<ul class="project-menu" role="listbox" transition:slide={{ duration: 120 }}>
							{#each projectList as p (p.id)}
								<li>
									<button
										class="project-option"
										class:selected={p.id === $activeProjectId}
										on:click={() => switchProject(p.id)}
										role="option"
										aria-selected={p.id === $activeProjectId}
									>
										{#if p.logoUrl}
											<img src={p.logoUrl} alt="" class="project-logo" />
										{:else}
											<span class="project-logo project-logo-fallback">{p.name[0]}</span>
										{/if}
										<span class="project-name">{p.name}</span>
										{#if p.id === $activeProjectId}
											<svg
												class="check"
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												stroke-linecap="round"
												stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
											>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
			{#if $auth.user}
				<span class="nav-user">{$auth.user.name}</span>
				<div class="notif-wrap">
					<button
						class="notif-bell"
						on:click={() => (notifOpen = !notifOpen)}
						aria-label={NOTIFICATIONS_LABEL}
						aria-haspopup="true"
						aria-expanded={notifOpen}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
							<path d="M13.73 21a2 2 0 0 1-3.46 0" />
						</svg>
						{#if $unreadNotificationCount > 0}
							<span class="notif-badge">{unreadCountBadge($unreadNotificationCount)}</span>
						{/if}
					</button>
					{#if notifOpen}
						<button
							class="notif-backdrop"
							on:click={() => (notifOpen = false)}
							tabindex="-1"
							aria-label="Close"
						></button>
						<div class="notif-panel" transition:slide={{ duration: 120 }}>
							<div class="notif-header">
								<span>{NOTIFICATIONS_LABEL}</span>
								{#if $unreadNotificationCount > 0}
									<button class="notif-mark-all" on:click={markInboxAllRead}>
										{MARK_ALL_READ_LABEL}
									</button>
								{/if}
							</div>
							{#if $notificationInbox.length === 0}
								<p class="notif-empty">{NO_NOTIFICATIONS_MESSAGE}</p>
							{:else}
								<ul class="notif-list">
									{#each $notificationInbox as n (n.id)}
										<li>
											<a
												href={n.link || '#'}
												class="notif-item"
												class:unread={!n.read}
												on:click={() => handleNotificationClick(n)}
											>
												<span class="notif-title">{n.title}</span>
												{#if n.body}<span class="notif-body">{n.body}</span>{/if}
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
			<a
				href="/settings"
				class="settings-btn"
				class:active={$page.url.pathname === '/settings'}
				aria-label="Settings"
				title="Settings"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="3" />
					<path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
					/>
				</svg>
			</a>

			<button
				class="hamburger"
				on:click={() => (menuOpen = !menuOpen)}
				aria-label={menuOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={menuOpen}
			>
				<span class:rotated={menuOpen}></span>
				<span class:hidden={menuOpen}></span>
				<span class:rotated-reverse={menuOpen}></span>
			</button>
		</div>
	</div>

	{#if menuOpen}
		<div class="mobile-menu" transition:slide={{ duration: 200 }}>
			{#each links as link}
				{#if link.sep}
					<hr class="mobile-sep" />
				{/if}
				<a
					href={link.href}
					class="mobile-link"
					class:active={$page.url.pathname === link.href ||
						$page.url.pathname.startsWith(link.href + '/')}
					on:click={closeMenu}
				>
					{link.label}
				</a>
			{/each}
			<a
				href="/settings"
				class="mobile-link"
				class:active={$page.url.pathname === '/settings'}
				on:click={closeMenu}
			>
				Settings
			</a>
		</div>
	{/if}
</nav>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		transition:
			background var(--duration-base) var(--ease-out),
			border-color var(--duration-base) var(--ease-out);
	}

	.inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
		height: 56px;
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	/* Brand */
	.brand {
		font-size: 1.2rem;
		letter-spacing: -0.02em;
		flex-shrink: 0;
		text-decoration: none;
	}

	.brand-logo {
		display: block;
		max-height: 24px;
		max-width: 140px;
		object-fit: contain;
	}

	.brand-serif {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--accent);
	}

	.brand-sans {
		font-family: var(--font-body);
		font-weight: 400;
		color: var(--text);
	}

	.project-switcher {
		position: relative;
	}
	.project-trigger {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.28rem 0.55rem;
		max-width: 200px;
		cursor: pointer;
		transition:
			border-color var(--duration-fast),
			background var(--duration-fast);
	}
	.project-trigger:hover {
		border-color: var(--text-muted);
		background: var(--bg-subtle);
	}
	.project-logo {
		width: 18px;
		height: 18px;
		border-radius: var(--radius-sm);
		object-fit: cover;
		flex-shrink: 0;
	}
	.project-logo-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	.project-trigger .project-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chevron {
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.project-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: transparent;
		border: none;
		cursor: default;
	}
	.project-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 51;
		min-width: 200px;
		max-width: 260px;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
	}
	.project-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		font-size: 0.82rem;
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}
	.project-option:hover {
		background: var(--bg-subtle);
	}
	.project-option.selected {
		color: var(--accent);
		font-weight: 600;
	}
	.project-option .project-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.check {
		color: var(--accent);
		flex-shrink: 0;
	}

	/* Desktop links */
	.links {
		display: flex;
		gap: 0.125rem;
		flex: 1;
	}

	.link {
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
		text-decoration: none;
		padding: 0.35rem 0.75rem;
		border-radius: var(--radius-sm);
		transition:
			color var(--duration-fast),
			background var(--duration-fast);
	}

	.link:hover {
		color: var(--text);
		background: var(--bg-subtle);
	}

	.link.active {
		color: var(--accent);
		background: var(--accent-soft);
	}

	.nav-sep {
		display: block;
		width: 1px;
		height: 18px;
		background: var(--border);
		margin: 0 0.375rem;
		flex-shrink: 0;
		align-self: center;
	}

	/* Actions */
	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.nav-user {
		font-size: 0.8125rem;
		color: var(--text-muted);
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 640px) {
		.nav-user {
			display: none;
		}
	}

	.notif-wrap {
		position: relative;
	}
	.notif-bell {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast);
	}
	.notif-bell:hover {
		color: var(--text);
		border-color: var(--border);
	}
	.notif-badge {
		position: absolute;
		top: 2px;
		right: 2px;
		min-width: 14px;
		height: 14px;
		padding: 0 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 1;
		color: var(--white);
		background: var(--fail);
		border-radius: var(--radius-pill);
	}
	.notif-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: transparent;
		border: none;
		cursor: default;
	}
	.notif-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 51;
		width: 320px;
		max-width: calc(100vw - 2rem);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
		overflow: hidden;
	}
	.notif-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text);
	}
	.notif-mark-all {
		font: inherit;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
	}
	.notif-mark-all:hover {
		text-decoration: underline;
	}
	.notif-empty {
		margin: 0;
		padding: 1.25rem 0.75rem;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.notif-list {
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		max-height: 320px;
		overflow-y: auto;
	}
	.notif-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 0.5rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
	}
	.notif-item:hover {
		background: var(--bg-subtle);
	}
	.notif-item.unread .notif-title {
		font-weight: 600;
	}
	.notif-item.unread {
		position: relative;
	}
	.notif-item.unread::before {
		content: '';
		position: absolute;
		top: 0.75rem;
		left: -0.05rem;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
	}
	.notif-title {
		font-size: 0.8125rem;
		color: var(--text);
	}
	.notif-body {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* Settings gear icon */
	.settings-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		text-decoration: none;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.settings-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
		border-color: var(--text-muted);
	}

	.settings-btn.active {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}

	/* Hamburger */
	.hamburger {
		display: none;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		width: 34px;
		height: 34px;
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0 8px;
	}

	.hamburger span {
		display: block;
		width: 100%;
		height: 1.5px;
		background: var(--text-muted);
		border-radius: 2px;
		transform-origin: center;
		transition:
			transform var(--duration-base) var(--ease-out),
			opacity var(--duration-fast);
	}

	.hamburger span.rotated {
		transform: translateY(5.5px) rotate(45deg);
	}

	.hamburger span.hidden {
		opacity: 0;
	}

	.hamburger span.rotated-reverse {
		transform: translateY(-5.5px) rotate(-45deg);
	}

	/* Mobile menu */
	.mobile-menu {
		border-top: 1px solid var(--border);
		padding: 0.75rem 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.mobile-link {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9375rem;
		font-weight: 400;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.mobile-link:hover,
	.mobile-link.active {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.mobile-link.active {
		color: var(--accent);
		background: var(--accent-soft);
	}

	.mobile-sep {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.375rem 0.75rem;
	}

	@media (max-width: 640px) {
		.links {
			display: none;
		}

		.hamburger {
			display: flex;
		}

		.inner {
			gap: 0.75rem;
			padding: 0 1rem;
		}

		.project-trigger {
			max-width: 130px;
		}

		.actions {
			gap: 0.375rem;
		}
	}

	@media (max-width: 380px) {
		.project-trigger .project-name {
			display: none;
		}
	}
</style>
