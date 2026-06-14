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
	import { theme } from '$lib/stores/theme';
	import { slide } from 'svelte/transition';

	let menuOpen = false;

	const links = [
		{ href: '/', label: 'Run Tests' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/scheduled-tests', label: 'Scheduled' }
	];

	function toggleTheme() {
		theme.update((t) => (t === 'light' ? 'dark' : 'light'));
	}

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
				<a href={link.href} class="link" class:active={$page.url.pathname === link.href}>
					{link.label}
				</a>
			{/each}
		</div>

		<div class="actions">
			<button class="theme-btn" on:click={toggleTheme} aria-label="Toggle theme">
				{#if $theme === 'light'}
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				{:else}
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="5" />
						<line x1="12" y1="1" x2="12" y2="3" />
						<line x1="12" y1="21" x2="12" y2="23" />
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
						<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
						<line x1="1" y1="12" x2="3" y2="12" />
						<line x1="21" y1="12" x2="23" y2="12" />
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
						<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
					</svg>
				{/if}
			</button>

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
				<a
					href={link.href}
					class="mobile-link"
					class:active={$page.url.pathname === link.href}
					on:click={closeMenu}
				>
					{link.label}
				</a>
			{/each}
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

	/* Actions */
	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.theme-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	.theme-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
		border-color: var(--text-muted);
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

	@media (max-width: 640px) {
		.links {
			display: none;
		}

		.hamburger {
			display: flex;
		}
	}
</style>
