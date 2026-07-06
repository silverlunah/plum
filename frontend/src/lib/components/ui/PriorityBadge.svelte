<!--
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 -->

<!--
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
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
