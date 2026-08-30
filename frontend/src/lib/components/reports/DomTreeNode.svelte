<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import { nodeSelectorParts, nodeTextPreview } from '$lib/utils/inspectElement';

	export let node;
	export let selectedNode = null;
	export let depth = 0;

	const dispatch = createEventDispatcher();

	$: childElements = Array.from(node.children ?? []);
	$: hasChildren = childElements.length > 0;
	$: isSelected = node === selectedNode;
	$: onSelectedPath = selectedNode && node !== selectedNode && node.contains(selectedNode);
	$: parts = nodeSelectorParts(node);
	$: textPreview = nodeTextPreview(node);

	let expanded = depth < 2;
	// Keep the path to the current selection open without collapsing branches the user opened.
	$: if (onSelectedPath) expanded = true;
</script>

<div class="dom-node">
	<div
		class="dom-row"
		class:selected={isSelected}
		data-selected={isSelected}
		role="treeitem"
		aria-selected={isSelected}
		tabindex="-1"
		style="padding-left: {depth * 0.85 + 0.4}rem"
		on:click|stopPropagation={() => dispatch('select', node)}
		on:mouseenter={() => dispatch('hover', node)}
		on:mouseleave={() => dispatch('hover', null)}
	>
		{#if hasChildren}
			<button
				class="twisty"
				class:open={expanded}
				tabindex="-1"
				on:click|stopPropagation={() => (expanded = !expanded)}
			>
				<svg
					width="9"
					height="9"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</button>
		{:else}
			<span class="twisty-spacer"></span>
		{/if}
		<span class="lt">&lt;</span><span class="tag">{parts.tag}</span>{#if parts.id}<span class="id"
				>#{parts.id}</span
			>{/if}{#each parts.classes as cls}<span class="cls">.{cls}</span>{/each}<span class="gt"
			>&gt;</span
		>
		{#if hasChildren && !expanded}
			<span class="hint">…</span>
		{:else if textPreview}
			<span class="text">{textPreview}</span>
		{/if}
	</div>

	{#if hasChildren && expanded}
		{#each childElements as child (child)}
			<svelte:self node={child} {selectedNode} depth={depth + 1} on:select on:hover />
		{/each}
	{/if}
</div>

<style>
	.dom-row {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding-top: 0.12rem;
		padding-bottom: 0.12rem;
		padding-right: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		line-height: 1.4;
		white-space: nowrap;
		cursor: pointer;
	}
	.dom-row:hover {
		background: var(--bg-subtle);
	}
	.dom-row.selected {
		background: var(--accent-soft);
	}

	.twisty {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: transform var(--duration-fast) var(--ease-out);
	}
	.twisty.open {
		transform: rotate(90deg);
	}
	.twisty-spacer {
		width: 12px;
		flex-shrink: 0;
	}

	.lt,
	.gt {
		color: var(--text-muted);
	}
	.tag {
		color: var(--text);
	}
	.dom-row.selected .tag {
		color: var(--accent);
		font-weight: 600;
	}
	.id {
		color: var(--accent);
	}
	.cls {
		color: var(--text-muted);
	}
	.hint {
		color: var(--text-muted);
	}
	.text {
		margin-left: 0.3rem;
		color: var(--text-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
