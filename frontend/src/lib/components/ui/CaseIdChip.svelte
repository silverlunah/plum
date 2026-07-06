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
	export let id = '';
	export let small = false;
</script>

<span class="id-chip" class:small>{id}</span>

<style>
	.id-chip {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 4px;
		letter-spacing: 0.02em;
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.id-chip.small {
		font-size: 0.63rem;
	}
</style>
