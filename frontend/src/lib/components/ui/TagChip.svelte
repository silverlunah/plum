<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let tag = '';
</script>

<span class="tag-chip">{tag}</span>

<style>
	.tag-chip {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		background: var(--accent-soft);
		color: var(--accent);
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}
</style>
