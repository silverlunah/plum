<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { afterUpdate } from 'svelte';

	export let output = '';

	let el;

	afterUpdate(() => {
		if (el) el.scrollTop = el.scrollHeight;
	});
</script>

<div class="terminal-wrap">
	<div class="terminal-bar">
		<span class="dot red"></span>
		<span class="dot yellow"></span>
		<span class="dot green"></span>
	</div>
	<pre bind:this={el} class="terminal">{output}</pre>
</div>

<style>
	.terminal-wrap {
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}

	.terminal-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.6rem 0.875rem;
		background: rgba(0, 0, 0, 0.3);
	}

	.dot {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.red {
		background: #ff5f57;
	}

	.yellow {
		background: #febc2e;
	}

	.green {
		background: #28c840;
	}

	.terminal {
		font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
		font-size: 0.78rem;
		line-height: 1.75;
		background: var(--terminal-bg);
		color: var(--terminal-text);
		padding: 1rem;
		min-height: 120px;
		max-height: 160px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.terminal::-webkit-scrollbar {
		width: 4px;
	}

	.terminal::-webkit-scrollbar-track {
		background: transparent;
	}

	.terminal::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}
</style>
