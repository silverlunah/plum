<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
