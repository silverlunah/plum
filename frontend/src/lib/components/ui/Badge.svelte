<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	/** @type {'pass' | 'fail' | 'tag' | 'schedule' | 'neutral' | 'node' | 'mcp' | 'external'} */
	export let variant = 'neutral';
</script>

<span class="badge {variant}"><slot /></span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
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

	.tag {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.schedule {
		background: var(--warn-soft);
		color: var(--warn);
	}

	.neutral {
		background: var(--bg-subtle);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.node {
		background: var(--node-soft);
		color: var(--node);
	}

	.mcp {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.external {
		background: var(--external-soft);
		color: var(--external);
	}
</style>
