<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	// A run's tag expression ("@TC-001 or @TC-002 or …"). When it holds more than
	// `limit` ids it collapses to the first few plus a "+N more" toggle; clicking
	// anywhere on it expands the full list, clicking again collapses.
	export let value = '';
	export let limit = 4;

	let expanded = false;

	$: ids = String(value ?? '')
		.split(/\s+or\s+/i)
		.map((s) => s.trim())
		.filter(Boolean);
	$: overflow = ids.length > limit;
	$: shown = expanded || !overflow ? ids : ids.slice(0, limit);
	$: hidden = ids.length - shown.length;
</script>

{#if overflow}
	<button
		type="button"
		class="taglist"
		aria-expanded={expanded}
		title={expanded ? 'Show fewer' : `Show all ${ids.length}`}
		on:click={() => (expanded = !expanded)}
	>
		<span class="ids"
			>{shown.join(' or ')}{#if hidden > 0}…{/if}</span
		>
		<span class="toggle">{hidden > 0 ? `+${hidden} more` : 'show fewer'}</span>
	</button>
{:else}
	<span class="taglist plain">{value}</span>
{/if}

<style>
	.taglist {
		font-family: 'JetBrains Mono', monospace;
		font-size: inherit;
		font-weight: inherit;
		color: inherit;
		line-height: inherit;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		text-align: left;
	}
	button.taglist {
		cursor: pointer;
	}
	.ids {
		white-space: normal;
		word-break: break-word;
	}
	.toggle {
		margin-left: 0.35rem;
		color: var(--accent);
		font-weight: 500;
		white-space: nowrap;
	}
	button.taglist:hover .toggle {
		text-decoration: underline;
	}
</style>
