<!--
This file is part of Plum.

Plum is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Plum is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Plum. If not, see https://www.gnu.org/licenses/.
-->

<script>
	import { createEventDispatcher } from 'svelte';

	export let current = 1;
	export let total = 1;

	const dispatch = createEventDispatcher();

	function go(page) {
		if (page < 1 || page > total) return;
		dispatch('change', page);
	}
</script>

{#if total > 1}
	<div class="pagination">
		<button class="arrow" on:click={() => go(current - 1)} disabled={current === 1} aria-label="Previous">
			←
		</button>

		{#each Array(total) as _, i}
			<button
				class="page"
				class:active={current === i + 1}
				on:click={() => go(i + 1)}
			>
				{i + 1}
			</button>
		{/each}

		<button class="arrow" on:click={() => go(current + 1)} disabled={current === total} aria-label="Next">
			→
		</button>
	</div>
{/if}

<style>
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
	}

	button {
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.25rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: 0.8125rem;
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast),
			border-color var(--duration-fast);
	}

	button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	button.active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	button:hover:not(:disabled):not(.active) {
		background: var(--bg-subtle);
		color: var(--text);
	}
</style>
