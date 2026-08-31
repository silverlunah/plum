<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	// One of: chromium/chrome, firefox, discord, slack. Anything else renders nothing.
	export let service = '';
	export let size = 14;

	const FILES = {
		chromium: 'chrome',
		chrome: 'chrome',
		firefox: 'firefox',
		discord: 'discord',
		slack: 'slack'
	};
	$: file = FILES[String(service).toLowerCase()] ?? null;
</script>

{#if file}
	<img
		class="service-icon"
		src="/external-services-icons/{file}.png"
		alt={file}
		width={size}
		height={size}
		style="width:{size}px;height:{size}px"
	/>
{/if}

<style>
	.service-icon {
		display: inline-block;
		flex-shrink: 0;
		object-fit: contain;
		vertical-align: middle;
	}
</style>
