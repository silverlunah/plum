<!--
This file is part of Plum.

Plum is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Plum is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Plum. If not, see https://www.gnu.org/licenses/.
-->

<script>
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	export let open = false;
	export let title = '';

	function close() {
		open = false;
	}

	function onBackdrop(e) {
		if (e.target === e.currentTarget) close();
	}

	function onKeydown(e) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div
		class="backdrop"
		role="presentation"
		on:click={onBackdrop}
		on:keydown={(e) => e.key === 'Escape' && close()}
		transition:fade={{ duration: 200 }}
	>
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			transition:scale={{ start: 0.96, duration: 260, easing: cubicOut }}
		>
			<div class="header">
				<h3 class="title">{title}</h3>
				<button class="close-btn" on:click={close} aria-label="Close">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			</div>
			<div class="body">
				<slot />
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 1rem;
		backdrop-filter: blur(2px);
	}

	.panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.75rem;
		width: 100%;
		max-width: 480px;
		box-shadow:
			0 4px 6px rgba(0, 0, 0, 0.04),
			0 24px 64px rgba(0, 0, 0, 0.14);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.title {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 400;
		color: var(--text);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.close-btn:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
