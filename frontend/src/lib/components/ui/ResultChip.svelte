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
	export let status = 'pending';

	$: v =
		status === 'pass'
			? 'pass'
			: status === 'fail'
				? 'fail'
				: status === 'blocked'
					? 'warn'
					: status === 'skip'
						? 'muted'
						: 'pending';
</script>

<span
	class="result-chip"
	class:pass={v === 'pass'}
	class:fail={v === 'fail'}
	class:warn={v === 'warn'}
	class:muted={v === 'muted'}
	class:pending={v === 'pending'}
>
	{status}
</span>

<style>
	.result-chip {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.6rem;
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}

	.pass {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.muted {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
	.pending {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
</style>
