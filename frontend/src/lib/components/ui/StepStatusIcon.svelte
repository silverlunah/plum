<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let status = 'passed';
</script>

<span
	class="step-status-icon"
	class:icon-pass={status === 'passed'}
	class:icon-fail={status === 'failed'}
	class:icon-skip={status !== 'passed' && status !== 'failed'}
>
	{#if status === 'passed'}✓{:else if status === 'failed'}✗{:else}−{/if}
</span>

<style>
	.step-status-icon {
		font-size: 0.75rem;
		font-weight: 600;
		width: 14px;
		flex-shrink: 0;
		text-align: center;
	}

	.icon-pass {
		color: var(--pass);
	}
	.icon-fail {
		color: var(--fail);
	}
	.icon-skip {
		color: var(--text-muted);
	}
</style>
