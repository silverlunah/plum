<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';
	import { clickOutside } from '$lib/actions/clickOutside';
	import ServiceIcon from '$lib/components/icons/ServiceIcon.svelte';

	/** [{ id, label, hint?, icon? }], icon defaults to the option id. */
	export let options = [];
	export let value = null;
	export let ariaLabel = '';
	export let iconSize = 13;
	/** 'field' for form rows, 'bar' for the compact runner bar. */
	export let variant = 'field';
	/** 'top' opens the menu upward, for triggers pinned near the bottom of the viewport. */
	export let placement = 'bottom';
	export let animate = false;
	/** Stretch the trigger to fill its container, chevron pinned to the far edge,
	 * matching a full-width text input beside it. */
	export let fullWidth = false;

	const dispatch = createEventDispatcher();
	let open = false;

	$: current = options.find((o) => o.id === value) ?? options[0];

	function pick(id) {
		open = false;
		dispatch('change', id);
	}
</script>

<div
	class="dropdown-wrap {variant}"
	class:full-width={fullWidth}
	use:clickOutside
	on:clickoutside={() => (open = false)}
>
	<button
		type="button"
		class="dropdown-trigger"
		class:open
		aria-label={ariaLabel || undefined}
		aria-haspopup="menu"
		aria-expanded={open}
		on:click={() => (open = !open)}
	>
		<span class="trigger-label">
			<ServiceIcon service={current?.icon ?? current?.id ?? ''} size={iconSize} />
			{current?.label ?? ''}
		</span>
		<svg
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			class="trigger-chevron"
			class:open
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>
	{#if open}
		<div
			class="dropdown-menu"
			class:up={placement === 'top'}
			role="menu"
			transition:fly={{ y: 6, duration: animate ? 130 : 0 }}
		>
			{#each options as option (option.id)}
				<button
					type="button"
					class="dropdown-item"
					class:active={option.id === value}
					role="menuitem"
					on:click={() => pick(option.id)}
				>
					<ServiceIcon service={option.icon ?? option.id} size={iconSize} />
					{option.label}
					{#if option.hint}<span class="item-hint">{option.hint}</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.dropdown-wrap {
		position: relative;
	}
	.field.dropdown-wrap {
		flex: 0 0 auto;
	}
	.dropdown-wrap.full-width {
		width: 100%;
	}
	.full-width .dropdown-trigger {
		width: 100%;
		justify-content: space-between;
	}
	.full-width .dropdown-menu {
		width: 100%;
	}

	.dropdown-trigger {
		align-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		color: var(--text);
		cursor: pointer;
		white-space: nowrap;
		transition:
			border-color var(--duration-fast),
			background var(--duration-fast),
			color var(--duration-fast);
	}
	.field .dropdown-trigger {
		display: flex;
		gap: 0.4rem;
		padding: 0.45rem 0.6rem;
		background: var(--bg-elevated);
		font-size: 0.8125rem;
	}
	.bar .dropdown-trigger {
		display: inline-flex;
		gap: 0.3rem;
		height: 24px;
		padding: 0 0.5rem;
		background: var(--bg-subtle);
		font-size: 0.78rem;
	}
	.dropdown-trigger:hover {
		border-color: color-mix(in srgb, var(--text-muted) 50%, var(--border));
	}
	.dropdown-trigger.open {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.trigger-label {
		align-items: center;
	}
	.field .trigger-label {
		display: flex;
		gap: 0.4rem;
	}
	.bar .trigger-label {
		display: inline-flex;
		gap: 0.35rem;
	}

	.trigger-chevron {
		transition: transform 0.18s var(--ease-out);
		flex-shrink: 0;
	}
	.trigger-chevron.open {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.13);
		padding: 0.3rem;
		z-index: 300;
		display: flex;
		flex-direction: column;
	}
	.dropdown-menu.up {
		top: auto;
		bottom: calc(100% + 8px);
	}
	.field .dropdown-menu {
		min-width: 140px;
	}
	.bar .dropdown-menu {
		min-width: 130px;
		gap: 1px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.5rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition: background var(--duration-fast);
	}
	.dropdown-item:hover {
		background: var(--bg-subtle);
	}
	.field .dropdown-item.active {
		color: var(--accent);
		background: var(--accent-soft);
	}
	.bar .dropdown-item.active {
		color: var(--accent);
	}

	.item-hint {
		margin-left: auto;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	/* Matches the runner bar's mobile layout, where each control fills its column. */
	@media (max-width: 640px) {
		.bar.dropdown-wrap {
			width: 100%;
		}
		.bar .dropdown-trigger {
			width: 100%;
			justify-content: space-between;
		}
		.bar .dropdown-menu {
			max-width: calc(100vw - 1.75rem);
		}
	}
</style>
