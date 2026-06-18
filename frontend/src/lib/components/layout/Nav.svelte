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
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { fetchProject } from '$lib/api/settings';

	let menuOpen = false;
	let project = { name: '', logoUrl: '' };

	onMount(async () => {
		try {
			project = await fetchProject();
		} catch {}
	});

	const links = [
		{ href: '/', label: 'Automated Tests' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/scheduled-tests', label: 'Scheduled' },
		{ href: '/test-repository', label: 'Test Repository', sep: true }
	];

	function closeMenu() {
		menuOpen = false;
	}
</script>

<nav class="nav">
	<div class="inner">
		<a href="/" class="brand" on:click={closeMenu}>
			<span class="brand-serif">Pl</span><span class="brand-sans">um</span>
		</a>

		<div class="links">
			{#each links as link}
				{#if link.sep}
					<span class="nav-sep" aria-hidden="true"></span>
				{/if}
				<a
					href={link.href}
					class="link"
					class:repo={link.sep}
					class:active={link.href === '/'
						? $page.url.pathname === '/'
						: $page.url.pathname.startsWith(link.href)}
				>
					{link.label}
				</a>
			{/each}
		</div>

		<div class="actions">
			{#if project.name}
				<div class="project-card">
					{#if project.logoUrl}
						<img src={project.logoUrl} alt="" class="project-logo" />
					{/if}
					<span class="project-name">{project.name}</span>
				</div>
			{/if}
			{#if $auth.user}
				<span class="nav-user">{$auth.user.name}</span>
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
					class:active={link.href === '/'
						? $page.url.pathname === '/'
						: $page.url.pathname.startsWith(link.href)}
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
		gap: 2rem;
	}

	/* Brand */
	.brand {
		font-size: 1.2rem;
		letter-spacing: -0.02em;
		flex-shrink: 0;
		text-decoration: none;
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

	/* Project card */
	.project-card {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.6rem 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}

	.project-logo {
		width: 16px;
		height: 16px;
		object-fit: contain;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.project-name {
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text);
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.link.repo {
		border: 1px solid var(--border);
		padding: 0.3rem 0.75rem;
	}

	.link.repo:hover {
		border-color: var(--text-muted);
	}

	.link.repo.active {
		border-color: var(--accent);
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
	}
</style>
