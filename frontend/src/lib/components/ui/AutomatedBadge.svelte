<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { AUTOMATED_LABEL } from '$lib/copy/common';
</script>

<span class="auto-badge">{AUTOMATED_LABEL}</span>

<style>
	.auto-badge {
		display: inline-flex;
		align-items: center;
		font-size: 0.62rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.45rem;
		flex-shrink: 0;
		white-space: nowrap;
	}
</style>
