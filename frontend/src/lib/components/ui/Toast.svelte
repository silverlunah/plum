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
	import { fly } from 'svelte/transition';

	/** @type {{ type: 'success' | 'error', message: string } | null} */
	export let toast = null;
</script>

{#if toast}
	<div class="toast alert alert-{toast.type}" transition:fly={{ y: -8, duration: 240 }}>
		{toast.message}
	</div>
{/if}

<style>
	.toast {
		margin-bottom: 1.25rem;
		border-radius: var(--radius-md);
	}
</style>
