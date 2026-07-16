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
