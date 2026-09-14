<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	export let src = '';
	export let alt = '';

	function close() {
		src = '';
	}
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && close()} />

{#if src}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-label={alt}
		on:click={close}
		transition:fade={{ duration: 160 }}
	>
		<img {src} {alt} transition:scale={{ start: 0.97, duration: 200, easing: cubicOut }} />
		<button class="close" on:click={close} aria-label="Close">
			<svg width="16" height="16" viewBox="0 0 14 14" fill="none">
				<path
					d="M1 1l12 12M13 1L1 13"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		/* Above the modal layer (400) so it can be opened from inside one. */
		z-index: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: rgba(0, 0, 0, 0.78);
		backdrop-filter: blur(3px);
		cursor: zoom-out;
	}

	img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: var(--radius-md);
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
	}

	.close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.12);
		color: var(--white);
		cursor: pointer;
		transition: background var(--duration-fast);
	}

	.close:hover {
		background: rgba(255, 255, 255, 0.24);
	}

	@media (max-width: 640px) {
		.backdrop {
			padding: 1rem;
		}
	}
</style>
