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
	export let message = 'Nothing here yet.';
	/** Optional extra padding class: 'sm' | 'md' (default) | 'lg' */
	export let size = 'md';
</script>

<p class="empty {size}"><slot>{message}</slot></p>

<style>
	.empty {
		color: var(--text-muted);
		font-size: 0.9375rem;
		text-align: center;
	}

	.sm {
		padding: 1.5rem 0;
	}
	.md {
		padding: 3rem 0;
	}
	.lg {
		padding: 5rem 0;
	}
</style>
