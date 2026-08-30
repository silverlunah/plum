<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onDestroy, createEventDispatcher } from 'svelte';
	import CodeViewer from '$lib/components/ui/CodeViewer.svelte';
	import DomTree from './DomTree.svelte';
	import {
		INSPECTOR_HEADING,
		CLOSE_INSPECTOR_LABEL,
		NO_ELEMENT_SELECTED,
		DOM_TREE_EMPTY,
		ELEMENT_ATTRIBUTES_LABEL,
		ELEMENT_SIZE_LABEL,
		INSPECTOR_TAB_ELEMENT,
		INSPECTOR_TAB_DOM
	} from '$lib/copy/reports';
	import { INSPECTOR_MIN_WIDTH } from '$lib/constants';

	const dispatch = createEventDispatcher();

	export let selectedElement = null;
	export let selectedNode = null;
	export let panelWidth = INSPECTOR_MIN_WIDTH;

	const TAB_KEY = 'plum:inspectorTab';
	const WIDTH_KEY = 'plum:inspectorWidth';
	const TABS = ['element', 'dom'];
	const MIN_WIDTH = INSPECTOR_MIN_WIDTH;

	let activeTab = 'element';
	if (typeof localStorage !== 'undefined') {
		const saved = localStorage.getItem(TAB_KEY);
		if (TABS.includes(saved)) activeTab = saved;
		const w = parseInt(localStorage.getItem(WIDTH_KEY), 10);
		if (w >= MIN_WIDTH) panelWidth = w;
	}

	function selectTab(tab) {
		activeTab = tab;
		if (typeof localStorage !== 'undefined') localStorage.setItem(TAB_KEY, tab);
	}

	let panelEl;
	let handleEl;
	let resizing = false;

	function onResizeMove(e) {
		// The panel's right edge is pinned, so width is the gap between the pointer
		// and that edge. Cap so it can't bury the whole player.
		const rightEdge = panelEl.getBoundingClientRect().right;
		const max = (panelEl.parentElement?.clientWidth ?? rightEdge) - 140;
		panelWidth = Math.max(MIN_WIDTH, Math.min(rightEdge - e.clientX, max));
	}

	function stopResize(e) {
		resizing = false;
		handleEl.releasePointerCapture?.(e.pointerId);
		handleEl.removeEventListener('pointermove', onResizeMove);
		handleEl.removeEventListener('pointerup', stopResize);
		handleEl.removeEventListener('pointercancel', stopResize);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem(WIDTH_KEY, String(Math.round(panelWidth)));
	}

	function startResize(e) {
		e.preventDefault();
		resizing = true;
		// Pointer capture keeps move/up events coming to the handle even while the
		// pointer is over the replay iframe — without it the iframe swallows them
		// and the drag silently drops the moment the cursor crosses the player.
		handleEl.setPointerCapture(e.pointerId);
		handleEl.addEventListener('pointermove', onResizeMove);
		handleEl.addEventListener('pointerup', stopResize);
		handleEl.addEventListener('pointercancel', stopResize);
	}
</script>

<div class="inspector-root" class:resizing style="width: {panelWidth}px" bind:this={panelEl}>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="resize-handle"
		title="Drag to resize"
		bind:this={handleEl}
		on:pointerdown={startResize}
	>
		<span class="resize-grip" aria-hidden="true">
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="11 7 6 12 11 17" />
				<polyline points="17 7 12 12 17 17" />
			</svg>
		</span>
	</div>
	<aside class="inspector-panel">
		<div class="inspector-header">
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
			</svg>
			{INSPECTOR_HEADING}
			<button
				class="inspector-close"
				title={CLOSE_INSPECTOR_LABEL}
				on:click={() => dispatch('close')}
			>
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
				{CLOSE_INSPECTOR_LABEL}
			</button>
		</div>

		<div class="inspector-tabs" role="tablist">
			<button
				class="inspector-tab"
				class:active={activeTab === 'element'}
				role="tab"
				aria-selected={activeTab === 'element'}
				on:click={() => selectTab('element')}
			>
				{INSPECTOR_TAB_ELEMENT}
			</button>
			<button
				class="inspector-tab"
				class:active={activeTab === 'dom'}
				role="tab"
				aria-selected={activeTab === 'dom'}
				on:click={() => selectTab('dom')}
			>
				{INSPECTOR_TAB_DOM}
			</button>
		</div>

		{#if activeTab === 'dom'}
			{#if selectedNode}
				<DomTree {selectedNode} on:select on:hover />
			{:else}
				<div class="inspector-pane">
					<div class="inspector-empty">{DOM_TREE_EMPTY}</div>
				</div>
			{/if}
		{:else}
			<div class="inspector-pane element-pane">
				{#if selectedElement}
					<CodeViewer code={selectedElement.markup} />
					<div class="inspector-section">
						<span class="inspector-section-label">{ELEMENT_SIZE_LABEL}</span>
						<span class="inspector-size"
							>{selectedElement.box.width} × {selectedElement.box.height}</span
						>
					</div>
					{#if selectedElement.attributes.length > 0}
						<div class="inspector-section">
							<span class="inspector-section-label">{ELEMENT_ATTRIBUTES_LABEL}</span>
						</div>
						<dl class="inspector-attrs">
							{#each selectedElement.attributes as attr}
								<div class="inspector-attr-row">
									<dt>{attr.name}</dt>
									<dd>{attr.value}</dd>
								</div>
							{/each}
						</dl>
					{/if}
				{:else}
					<div class="inspector-empty">{NO_ELEMENT_SELECTED}</div>
				{/if}
			</div>
		{/if}
	</aside>
</div>

<style>
	/* Overlays the right of the player instead of taking flex space, so widening
	   the panel never shrinks the replay. Not clipped, so the resize grip on the
	   left edge can sit proud of the panel. */
	.inspector-root {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
	}
	.inspector-root.resizing {
		user-select: none;
	}

	.inspector-panel {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg-elevated);
		border-left: 1px solid var(--border);
		overflow: hidden;
	}

	.resize-handle {
		position: absolute;
		top: 0;
		left: -4px;
		bottom: 0;
		width: 8px;
		z-index: 21;
		cursor: col-resize;
		touch-action: none;
	}
	.resize-handle:hover,
	.inspector-root.resizing .resize-handle {
		background: color-mix(in srgb, var(--accent) 45%, transparent);
	}

	/* Visible grab affordance — centred on the panel's left border, near the
	   player's control bar so it never overlaps the replay content. */
	.resize-grip {
		position: absolute;
		left: 50%;
		bottom: 14px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 34px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-muted);
	}
	.resize-handle:hover .resize-grip,
	.inspector-root.resizing .resize-grip {
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
		color: var(--accent);
		background: var(--accent-soft);
	}

	.inspector-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 0.6rem 0.5rem 0.9rem;
		border-bottom: 1px solid var(--border);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.inspector-close {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.45rem;
		font-family: inherit;
		font-size: 0.62rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast),
			background var(--duration-fast);
	}
	.inspector-close:hover {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
		background: var(--accent-soft);
	}

	.inspector-tabs {
		display: flex;
		flex-shrink: 0;
		border-bottom: 1px solid var(--border);
	}
	.inspector-tab {
		flex: 1;
		padding: 0.5rem 0.75rem;
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-muted);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: color var(--duration-fast);
	}
	.inspector-tab:hover {
		color: var(--text);
	}
	.inspector-tab.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	.inspector-pane {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem 0.9rem 0.9rem;
	}

	.element-pane {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	/* A long attribute list scrolls the pane, doesn't squeeze the code viewer. */
	.element-pane > * {
		flex-shrink: 0;
	}
	.element-pane :global(.code-viewer) {
		flex-shrink: 0;
	}

	.inspector-empty {
		color: var(--text-muted);
		font-size: 0.8rem;
		padding: 1rem 0.1rem;
		line-height: 1.5;
	}

	.inspector-section {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.inspector-section-label {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	.inspector-size {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: var(--text);
	}

	.inspector-attrs {
		margin: 0;
		display: flex;
		flex-direction: column;
	}
	.inspector-attr-row {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.35rem 0;
		border-top: 1px solid var(--border);
	}
	.inspector-attr-row dt {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: var(--accent);
	}
	.inspector-attr-row dd {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
		word-break: break-all;
	}
</style>
