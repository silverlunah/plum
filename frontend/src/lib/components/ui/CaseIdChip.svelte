<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let id = '';
	export let small = false;
</script>

<span class="id-chip" class:small>{id}</span>

<style>
	.id-chip {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 4px;
		letter-spacing: 0.02em;
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.id-chip.small {
		font-size: 0.63rem;
	}
</style>
