<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import Modal from './Modal.svelte';
	import { CONFIRM_TITLE, CONFIRM_LABEL, CANCEL_LABEL, WORKING_LABEL } from '$lib/copy/common';

	export let open = false;
	export let title = CONFIRM_TITLE;
	export let confirmLabel = CONFIRM_LABEL;
	export let loading = false;

	const dispatch = createEventDispatcher();
</script>

<Modal bind:open {title}>
	<div class="body">
		<slot />
	</div>
	<div class="actions">
		<button class="btn-danger" on:click={() => dispatch('confirm')} disabled={loading}>
			{loading ? WORKING_LABEL : confirmLabel}
		</button>
		<button class="btn-cancel" on:click={() => (open = false)} disabled={loading}
			>{CANCEL_LABEL}</button
		>
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
		color: var(--white);
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
