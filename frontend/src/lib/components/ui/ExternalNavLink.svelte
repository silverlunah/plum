<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let href = '';
	export let label = '';
</script>

<a class="ext-nav-link" {href} target="_blank" rel="noopener noreferrer">
	<slot />
	<span class="ext-nav-label">{label}</span>
	<svg
		class="ext-nav-arrow"
		width="12"
		height="12"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		<polyline points="15 3 21 3 21 9" />
		<line x1="10" y1="14" x2="21" y2="3" />
	</svg>
</a>

<style>
	.ext-nav-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.45rem 0.75rem;
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		font-size: 0.875rem;
		color: var(--text-muted);
		text-decoration: none;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}
	.ext-nav-link:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}
	.ext-nav-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ext-nav-arrow {
		flex-shrink: 0;
		margin-left: auto;
		opacity: 0.5;
	}
</style>
