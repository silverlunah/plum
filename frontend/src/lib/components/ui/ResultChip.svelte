<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let status = 'pending';

	$: v =
		status === 'pass'
			? 'pass'
			: status === 'fail'
				? 'fail'
				: status === 'blocked'
					? 'warn'
					: status === 'skip'
						? 'muted'
						: 'pending';
</script>

<span
	class="result-chip"
	class:pass={v === 'pass'}
	class:fail={v === 'fail'}
	class:warn={v === 'warn'}
	class:muted={v === 'muted'}
	class:pending={v === 'pending'}
>
	{status}
</span>

<style>
	.result-chip {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.6rem;
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}

	.pass {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.muted {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
	.pending {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
</style>
