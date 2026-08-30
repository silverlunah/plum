<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import { nodeTag, nodeTextPreview } from '$lib/utils/inspectElement';

	export let node;
	export let selectedNode = null;
	export let depth = 0;

	const dispatch = createEventDispatcher();

	$: childElements = Array.from(node.children ?? []);
	$: hasChildren = childElements.length > 0;
	$: isSelected = node === selectedNode;
	$: onSelectedPath = selectedNode && node !== selectedNode && node.contains(selectedNode);
	$: ({ tag, attributes, isVoid } = nodeTag(node));
	$: textPreview = nodeTextPreview(node);
	// What follows the opening tag on the same row.
	$: inlineTail = hasChildren && !expanded ? 'collapsed' : !hasChildren && !isVoid ? 'leaf' : '';

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
		<span class="lt">&lt;</span><span class="tag">{tag}</span>{#each attributes as attr}<span
				class="attr-name">{' '}{attr.name}</span
			><span class="attr-eq">=</span><span class="attr-val">"{attr.value}"</span>{/each}<span
			class="gt">&gt;</span
		>{#if inlineTail === 'collapsed'}<span class="hint">…</span><span class="lt">&lt;/</span><span
				class="tag">{tag}</span
			><span class="gt">&gt;</span>{:else if inlineTail === 'leaf'}{#if textPreview}<span
					class="text">{textPreview}</span
				>{/if}<span class="lt">&lt;/</span><span class="tag">{tag}</span><span class="gt">&gt;</span
			>{/if}
	</div>

	{#if hasChildren && expanded}
		{#each childElements as child (child)}
			<svelte:self node={child} {selectedNode} depth={depth + 1} on:select on:hover />
		{/each}
		<div class="dom-row close" style="padding-left: {depth * 0.85 + 0.4}rem">
			<span class="twisty-spacer"></span><span class="lt">&lt;/</span><span class="tag">{tag}</span
			><span class="gt">&gt;</span>
		</div>
	{/if}
</div>

<style>
	/* Font family / size / line-height match $lib/components/ui/CodeViewer so the
	   DOM tab reads as the same code surface as the Element tab. */
	.dom-row {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding-top: 0.14rem;
		padding-bottom: 0.14rem;
		padding-right: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		line-height: 1.5;
		white-space: nowrap;
		cursor: pointer;
	}
	.dom-row:hover {
		background: rgb(255 255 255 / 0.06);
	}
	.dom-row.selected {
		background: color-mix(in srgb, var(--accent) 28%, transparent);
	}
	.dom-row.close {
		cursor: default;
	}
	.dom-row.close:hover {
		background: none;
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
		color: var(--terminal-text);
		opacity: 0.5;
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
		color: var(--code-comment);
	}
	.tag {
		color: var(--code-tag);
	}
	.attr-name {
		color: var(--code-attr);
	}
	.attr-eq {
		color: var(--code-comment);
	}
	.attr-val {
		color: var(--code-string);
	}
	.hint {
		color: var(--code-comment);
	}
	.text {
		margin-left: 0.3rem;
		color: var(--code-comment);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
