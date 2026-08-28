<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import CodeViewer from '$lib/components/ui/CodeViewer.svelte';
	import {
		INSPECTOR_HEADING,
		NO_ELEMENT_SELECTED,
		ELEMENT_ATTRIBUTES_LABEL,
		ELEMENT_SIZE_LABEL
	} from '$lib/copy/reports';

	export let selectedElement = null;
</script>

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
	</div>
	{#if selectedElement}
		<CodeViewer code={selectedElement.markup} />
		<div class="inspector-section">
			<span class="inspector-section-label">{ELEMENT_SIZE_LABEL}</span>
			<span class="inspector-size">{selectedElement.box.width} × {selectedElement.box.height}</span>
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
</aside>

<style>
	.inspector-panel {
		flex-shrink: 0;
		width: 280px;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 0.75rem 0.9rem 0.9rem;
		background: var(--bg-elevated);
		overflow-y: auto;
	}
	/* A long attribute list scrolls the panel, doesn't squeeze the code viewer. */
	.inspector-panel > * {
		flex-shrink: 0;
	}
	.inspector-panel :global(.code-viewer) {
		flex-shrink: 0;
	}

	.inspector-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.5rem;
		margin-bottom: 0.1rem;
		border-bottom: 1px solid var(--border);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
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
