<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let code = '';

	function escapeHtml(s) {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function highlight(raw) {
		const escaped = escapeHtml(raw);
		return escaped
			.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
			.replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, '$1<span class="tok-tag">$2</span>')
			.replace(
				/([a-zA-Z_:][a-zA-Z0-9_:.-]*)(=)(&quot;[^&]*&quot;)/g,
				'<span class="tok-attr">$1</span>$2<span class="tok-value">$3</span>'
			);
	}

	$: highlighted = highlight(code);
</script>

<pre class="code-viewer"><code>{@html highlighted}</code></pre>

<style>
	.code-viewer {
		margin: 0;
		padding: 0.75rem 1rem;
		background: var(--terminal-bg);
		color: var(--terminal-text);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		line-height: 1.5;
		border-radius: var(--radius-md);
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}
	:global(.code-viewer .tok-tag) {
		color: var(--code-tag);
	}
	:global(.code-viewer .tok-attr) {
		color: var(--code-attr);
	}
	:global(.code-viewer .tok-value) {
		color: var(--code-string);
	}
	:global(.code-viewer .tok-comment) {
		color: var(--code-comment);
		font-style: italic;
	}
</style>
