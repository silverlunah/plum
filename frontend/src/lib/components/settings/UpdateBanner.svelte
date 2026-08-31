<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { checkUpdate } from '$lib/api/server';
	import { updateBannerText, UPDATE_NPM_LINK_LABEL } from '$lib/copy/settings';

	let info = null;

	onMount(async () => {
		try {
			const res = await checkUpdate();
			if (res.updateAvailable) info = res;
		} catch {}
	});
</script>

{#if info}
	<div class="update-banner">
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</svg>
		<span class="text">
			<code>{info.current}</code> → <code>{info.latest}</code> · {updateBannerText(info.latest)}
		</span>
		<a class="link" href={info.npmUrl} target="_blank" rel="noreferrer noopener">
			{UPDATE_NPM_LINK_LABEL}
		</a>
	</div>
{/if}

<style>
	.update-banner {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.5rem;
		padding: 0.7rem 1rem;
		font-size: 0.8125rem;
		color: var(--text);
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
	}
	.update-banner svg {
		flex-shrink: 0;
		color: var(--accent);
	}
	.text {
		flex: 1;
		line-height: 1.5;
	}
	.text code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
	}
	.link {
		flex-shrink: 0;
		font-weight: 600;
		color: var(--accent);
		white-space: nowrap;
	}
</style>
