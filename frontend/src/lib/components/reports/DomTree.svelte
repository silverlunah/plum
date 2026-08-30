<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { tick } from 'svelte';
	import DomTreeNode from './DomTreeNode.svelte';

	export let selectedNode = null;

	$: root = selectedNode?.ownerDocument?.documentElement ?? null;

	let scrollEl;
	$: locate(selectedNode, scrollEl);

	async function locate(node, container) {
		if (!node || !container) return;
		// Ancestor rows auto-expand reactively; wait for that flush, then one more
		// frame so the freshly mounted row exists before scrolling to it.
		await tick();
		requestAnimationFrame(() => {
			container
				?.querySelector('[data-selected="true"]')
				?.scrollIntoView({ block: 'center', inline: 'nearest' });
		});
	}
</script>

{#if root}
	<div class="dom-tree" bind:this={scrollEl} role="tree">
		{#key root}
			<DomTreeNode node={root} {selectedNode} depth={0} on:select on:hover />
		{/key}
	</div>
{/if}

<style>
	.dom-tree {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0.5rem 0;
		background: var(--terminal-bg);
		color: var(--terminal-text);
	}
</style>
