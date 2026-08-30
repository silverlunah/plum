<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { PAGINATOR_RANGE } from '$lib/copy/common';

	export let page = 0; // zero-based
	export let total = 0;
	export let perPage = 20;

	$: pages = Math.max(1, Math.ceil(total / perPage));
	$: from = total === 0 ? 0 : page * perPage + 1;
	$: to = Math.min(total, (page + 1) * perPage);

	// Clamp if the list shrank under us.
	$: if (page > pages - 1) page = pages - 1;
</script>

{#if pages > 1}
	<div class="paginator">
		<span class="range">{PAGINATOR_RANGE(from, to, total)}</span>
		<div class="nav">
			<button on:click={() => (page = Math.max(0, page - 1))} disabled={page === 0}>‹</button>
			<button on:click={() => (page = Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>
				›
			</button>
		</div>
	</div>
{/if}

<style>
	.paginator {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-top: 0.5rem;
	}
	.range {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.nav {
		display: flex;
		gap: 0.25rem;
	}
	.nav button {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		line-height: 1;
		color: var(--text);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.nav button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
