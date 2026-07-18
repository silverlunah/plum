<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { EMPTY_STATE_MESSAGE } from '$lib/copy/common';

	export let title = '';
	export let description = '';
	export let message = EMPTY_STATE_MESSAGE;
	/** Optional extra padding class: 'sm' | 'md' (default) | 'lg' */
	export let size = 'md';
</script>

{#if title}
	<div class="empty {size}">
		<p class="empty-title">{title}</p>
		{#if description}<p class="empty-desc">{description}</p>{/if}
	</div>
{:else}
	<p class="empty {size}"><slot>{message}</slot></p>
{/if}

<style>
	.empty {
		color: var(--text-muted);
		font-size: 0.9375rem;
		text-align: center;
	}

	.empty-title {
		color: var(--text);
		font-size: 0.9375rem;
		font-weight: 500;
		margin-bottom: 0.25rem;
	}

	.empty-desc {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.sm {
		padding: 1.5rem 0;
	}
	.md {
		padding: 3rem 0;
	}
	.lg {
		padding: 5rem 0;
	}
</style>
