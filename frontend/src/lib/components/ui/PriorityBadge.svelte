<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let priority = 'Medium';
	export let small = false;

	$: p = priority?.toLowerCase() ?? 'medium';
</script>

<span
	class="priority-badge"
	class:critical={p === 'critical'}
	class:high={p === 'high'}
	class:medium={p === 'medium'}
	class:low={p === 'low'}
	class:small
>
	{priority}
</span>

<style>
	.priority-badge {
		font-size: 0.65rem;
		font-weight: 500;
		border-radius: var(--radius-pill);
		padding: 0.12rem 0.45rem;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.priority-badge.small {
		font-size: 0.6rem;
	}

	.critical {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.high {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.medium {
		background: var(--node-soft);
		color: var(--node);
	}
	.low {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
</style>
