<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let status = 'passed';
	// A flaky scenario passed, but only on a retry, show it amber, not green.
	export let flaky = false;
</script>

<span
	class="status-dot"
	class:pass={status === 'passed' && !flaky}
	class:fail={status === 'failed'}
	class:flaky={status === 'passed' && flaky}
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
	.flaky {
		background: var(--warn);
	}
	.skip {
		background: var(--text-muted);
	}
</style>
