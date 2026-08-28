<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';
	import StepKeyword from '$lib/components/ui/StepKeyword.svelte';
	import StepStatusIcon from '$lib/components/ui/StepStatusIcon.svelte';
	import { STEPS_RAIL_HEADING } from '$lib/copy/reports';

	export let steps = [];
	export let stepTimestamps = [];
	export let currentStepIndex = -1;

	const dispatch = createEventDispatcher();
</script>

<aside class="steps-rail">
	<div class="steps-rail-header">{STEPS_RAIL_HEADING}</div>
	<ol class="steps-list">
		{#each steps as step, i}
			<li>
				<button
					class="rail-step"
					class:rail-step-active={i === currentStepIndex}
					disabled={stepTimestamps[i] === undefined}
					on:click={() => dispatch('jump', i)}
				>
					<StepStatusIcon status={step.status} />
					<span class="rail-step-text">
						<StepKeyword keyword={step.keyword} />
						<span>{step.name}</span>
					</span>
				</button>
			</li>
		{/each}
	</ol>
</aside>

<style>
	.steps-rail {
		flex-shrink: 0;
		width: 240px;
		display: flex;
		flex-direction: column;
		background: var(--bg-elevated);
		overflow-y: auto;
	}

	.steps-rail-header {
		flex-shrink: 0;
		padding: 0.7rem 0.9rem 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.steps-list {
		list-style: none;
		margin: 0;
		padding: 0 0.5rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.rail-step {
		width: 100%;
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		font: inherit;
		font-size: 0.78rem;
		line-height: 1.35;
		text-align: left;
		color: var(--text-muted);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-out);
	}
	.rail-step:hover:not(:disabled) {
		background: var(--bg-subtle);
	}
	.rail-step:disabled {
		cursor: default;
	}

	.rail-step-text {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
		word-break: break-word;
	}

	.rail-step-active {
		background: var(--accent-soft);
		color: var(--text);
		font-weight: 500;
	}
</style>
