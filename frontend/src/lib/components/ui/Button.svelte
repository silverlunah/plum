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
	/** @type {'primary' | 'ghost' | 'danger' | 'outline'} */
	export let variant = 'primary';
	/** @type {'sm' | 'md'} */
	export let size = 'md';
	export let type = 'button';
	export let disabled = false;
</script>

<button {type} {disabled} class="btn {variant} {size}" on:click>
	<slot />
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		font-family: var(--font-body);
		font-weight: 400;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		text-decoration: none;
		transition:
			background var(--duration-fast) var(--ease-out),
			color var(--duration-fast) var(--ease-out),
			border-color var(--duration-fast) var(--ease-out),
			box-shadow var(--duration-fast) var(--ease-out),
			transform var(--duration-fast) var(--ease-out),
			opacity var(--duration-fast);
	}

	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	/* Sizes */
	.sm {
		font-size: 0.75rem;
		padding: 0.3rem 0.75rem;
		border-radius: var(--radius-sm);
	}

	.md {
		font-size: 0.875rem;
		padding: 0.55rem 1.25rem;
	}

	/* Variants */
	.primary {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.primary:hover:not(:disabled) {
		filter: brightness(1.12);
		box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.ghost {
		background: transparent;
		color: var(--text-muted);
		border-color: var(--border);
	}

	.ghost:hover:not(:disabled) {
		background: var(--bg-subtle);
		color: var(--text);
		border-color: var(--text-muted);
	}

	.danger {
		background: transparent;
		color: var(--fail);
		border-color: var(--fail);
	}

	.danger:hover:not(:disabled) {
		background: var(--fail-soft);
	}

	.outline {
		background: transparent;
		color: var(--accent);
		border-color: var(--accent);
	}

	.outline:hover:not(:disabled) {
		background: var(--accent-soft);
	}
</style>
