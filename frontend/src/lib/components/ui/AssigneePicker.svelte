<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import {
		UNASSIGNED_OPTION,
		ASSIGNEE_SEARCH_PLACEHOLDER,
		NO_MATCHING_PEOPLE
	} from '$lib/copy/repository';

	export let members = [];
	export let value = null; // selected user id, or null/'' for unassigned
	export let name = null; // selected user's display name, when known
	export let disabled = false;

	const dispatch = createEventDispatcher();
	let open = false;
	let query = '';
	let triggerEl;
	// Menu is fixed-positioned off the trigger's rect so a card with `overflow:
	// hidden` further up can't clip it (the last row's menu used to be unusable).
	let menuPos = { top: 0, right: 0 };

	const matchName = (m, q) =>
		!q.trim() || `${m.name} ${m.email}`.toLowerCase().includes(q.trim().toLowerCase());

	function toggle() {
		if (disabled) return;
		open = !open;
		query = '';
		if (open && triggerEl) {
			const r = triggerEl.getBoundingClientRect();
			menuPos = { top: r.bottom + 4, right: window.innerWidth - r.right };
		}
	}

	function pick(id) {
		open = false;
		dispatch('change', id);
	}

	function onWindowClick(e) {
		if (open && !e.target.closest('.assignee-picker')) open = false;
	}
</script>

<svelte:window
	on:click={onWindowClick}
	on:keydown={(e) => e.key === 'Escape' && (open = false)}
	on:scroll|capture={() => (open = false)}
	on:resize={() => (open = false)}
/>

<div class="assignee-picker">
	<button
		type="button"
		class="assignee-trigger"
		class:open
		class:unassigned={!value}
		{disabled}
		bind:this={triggerEl}
		on:click|stopPropagation={toggle}
	>
		{name ?? UNASSIGNED_OPTION}
	</button>
	{#if open}
		<div
			class="assignee-menu"
			role="presentation"
			style="top: {menuPos.top}px; right: {menuPos.right}px"
			on:click|stopPropagation
		>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="assignee-search"
				placeholder={ASSIGNEE_SEARCH_PLACEHOLDER}
				bind:value={query}
				autofocus
			/>
			<ul>
				<li>
					<button type="button" class:selected={!value} on:click={() => pick('')}>
						{UNASSIGNED_OPTION}
					</button>
				</li>
				{#each members.filter((m) => matchName(m, query)) as m (m.id)}
					<li>
						<button type="button" class:selected={m.id === value} on:click={() => pick(m.id)}>
							<span>{m.name}</span>
							<span class="assignee-email">{m.email}</span>
						</button>
					</li>
				{:else}
					<li class="assignee-empty">{NO_MATCHING_PEOPLE}</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.assignee-picker {
		position: relative;
		flex-shrink: 0;
	}
	.assignee-trigger {
		font-size: 0.75rem;
		font-family: var(--font-body);
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		max-width: 10rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.assignee-trigger:hover:not(:disabled),
	.assignee-trigger.open {
		border-color: var(--accent);
	}
	.assignee-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.assignee-trigger.unassigned {
		color: var(--text-muted);
	}
	.assignee-menu {
		position: fixed;
		z-index: 100;
		width: 15rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
		padding: 0.3rem;
	}
	.assignee-search {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.78rem;
		padding: 0.35rem 0.45rem;
		margin-bottom: 0.3rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.assignee-search:focus {
		outline: none;
		border-color: var(--accent);
	}
	.assignee-menu ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 12rem;
		overflow-y: auto;
	}
	.assignee-menu li button {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		width: 100%;
		padding: 0.35rem 0.45rem;
		font: inherit;
		font-size: 0.8rem;
		color: var(--text);
		text-align: left;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.assignee-menu li button:hover {
		background: var(--bg-subtle);
	}
	.assignee-menu li button.selected {
		color: var(--accent);
		font-weight: 600;
	}
	.assignee-email {
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.assignee-empty {
		padding: 0.5rem 0.45rem;
		font-size: 0.78rem;
		color: var(--text-muted);
	}
</style>
