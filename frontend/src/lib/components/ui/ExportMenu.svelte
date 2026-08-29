<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import { EXPORT_LABEL, EXPORT_MENU_ITEMS } from '$lib/copy/common';

	export let label = EXPORT_LABEL;
	export let items = EXPORT_MENU_ITEMS;
	export let busy = false;
	export let disabled = false;
	export let align = 'right';

	const dispatch = createEventDispatcher();
	let open = false;
	let root;

	function toggle() {
		if (!disabled && !busy) open = !open;
	}

	function pick(id) {
		open = false;
		dispatch('select', id);
	}

	function onWindowClick(e) {
		if (open && root && !root.contains(e.target)) open = false;
	}
</script>

<svelte:window on:click={onWindowClick} on:keydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="export-menu" bind:this={root}>
	<button
		type="button"
		class="trigger"
		class:open
		{disabled}
		aria-haspopup="menu"
		aria-expanded={open}
		on:click={toggle}
	>
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
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</svg>
		<span>{busy ? '…' : label}</span>
	</button>

	{#if open}
		<div class="popover" class:left={align === 'left'} role="menu">
			{#each items as item (item.id)}
				<button type="button" class="item" role="menuitem" on:click={() => pick(item.id)}>
					<span class="item-label">{item.label}</span>
					{#if item.hint}<span class="item-hint">{item.hint}</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.export-menu {
		position: relative;
		display: inline-flex;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		padding: 0.55rem 1rem;
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background var(--duration-fast) var(--ease-out),
			color var(--duration-fast) var(--ease-out),
			border-color var(--duration-fast) var(--ease-out);
	}
	.trigger:hover:not(:disabled),
	.trigger.open {
		background: var(--bg-subtle);
		color: var(--text);
		border-color: var(--text-muted);
	}
	.trigger:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.popover {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 12rem;
		padding: 0.3rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.13);
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.popover.left {
		right: auto;
		left: 0;
	}

	.item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		width: 100%;
		padding: 0.5rem 0.65rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
	}
	.item:hover {
		background: var(--bg-subtle);
	}
	.item-label {
		font-size: 0.85rem;
		color: var(--text);
	}
	.item-hint {
		font-size: 0.72rem;
		color: var(--text-muted);
	}
</style>
