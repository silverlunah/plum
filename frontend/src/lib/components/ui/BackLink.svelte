<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let href = '/reports';
	export let label = 'Reports';
</script>

<div class="back-row">
	<a {href} class="back-link">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="12 19 5 12 12 5" />
		</svg>
		{label}
	</a>
</div>

<style>
	.back-row {
		margin-bottom: 1.5rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
		transition: color var(--duration-fast);
	}

	.back-link:hover {
		color: var(--text);
	}
</style>
