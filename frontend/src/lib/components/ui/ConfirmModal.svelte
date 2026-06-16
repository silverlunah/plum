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
	import { createEventDispatcher } from 'svelte';
	import Modal from './Modal.svelte';

	export let open = false;
	export let title = 'Confirm';
	export let confirmLabel = 'Delete';
	export let loading = false;

	const dispatch = createEventDispatcher();
</script>

<Modal bind:open {title}>
	<div class="body">
		<slot />
	</div>
	<div class="actions">
		<button class="btn-danger" on:click={() => dispatch('confirm')} disabled={loading}>
			{loading ? 'Working…' : confirmLabel}
		</button>
		<button class="btn-cancel" on:click={() => (open = false)} disabled={loading}>Cancel</button>
	</div>
</Modal>

<style>
	.body {
		font-size: 0.9375rem;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.body :global(strong) {
		color: var(--text);
		font-weight: 500;
	}

	.actions {
		display: flex;
		gap: 0.625rem;
		padding-top: 0.25rem;
	}

	.btn-danger {
		height: 34px;
		padding: 0 1rem;
		font-size: 0.8125rem;
		font-family: inherit;
		font-weight: 500;
		background: var(--fail);
		border: 1px solid var(--fail);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: #fff;
		transition: opacity var(--duration-fast);
	}

	.btn-danger:hover:not(:disabled) {
		opacity: 0.85;
	}
	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-cancel {
		height: 34px;
		padding: 0 1rem;
		font-size: 0.8125rem;
		font-family: inherit;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: var(--text);
		transition: background var(--duration-fast);
	}

	.btn-cancel:hover {
		background: var(--bg-subtle);
	}
</style>
