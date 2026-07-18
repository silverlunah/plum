<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let status = 'passed';
</script>

<span
	class="status-dot"
	class:pass={status === 'passed'}
	class:fail={status === 'failed'}
	class:skip={status !== 'passed' && status !== 'failed'}
></span>

<style>
	.status-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.pass {
		background: var(--pass);
	}
	.fail {
		background: var(--fail);
	}
	.skip {
		background: var(--text-muted);
	}
</style>
