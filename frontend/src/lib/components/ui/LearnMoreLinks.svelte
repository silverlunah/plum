<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { PLAYWRIGHT_URL, CUCUMBER_URL } from '$lib/constants';
	import { POWERED_BY_LABEL, PLAYWRIGHT_LABEL, CUCUMBER_LABEL } from '$lib/copy/common';
	import { activeFramework } from '$lib/stores/project';
	import ServiceIcon from '$lib/components/icons/ServiceIcon.svelte';

	// A Cucumber project drives Playwright underneath, so it credits both. A
	// Playwright project never touches Cucumber and must not link to it.
	$: showCucumber = $activeFramework === 'cucumber';
</script>

<div class="learn-more">
	<span class="learn-more-label">{POWERED_BY_LABEL}</span>
	<a href={PLAYWRIGHT_URL} target="_blank" rel="noopener noreferrer">
		<ServiceIcon service="playwright" size={14} />
		{PLAYWRIGHT_LABEL}
	</a>
	{#if showCucumber}
		<a href={CUCUMBER_URL} target="_blank" rel="noopener noreferrer">
			<ServiceIcon service="cucumber" size={14} />
			{CUCUMBER_LABEL}
		</a>
	{/if}
</div>

<style>
	.learn-more {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 0.85rem;
		font-size: 0.8125rem;
	}
	.learn-more-label {
		color: var(--text-muted);
	}
	.learn-more a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--text);
		text-decoration: none;
	}
	.learn-more a:hover {
		color: var(--accent);
		text-decoration: underline;
	}
</style>
