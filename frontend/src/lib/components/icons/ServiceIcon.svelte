<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	// One of: chromium/chrome, firefox, discord, slack, playwright, cucumber.
	// Anything else renders nothing.
	export let service = '';
	export let size = 14;

	const FILES = {
		chromium: 'chrome.png',
		chrome: 'chrome.png',
		firefox: 'firefox.png',
		discord: 'discord.png',
		slack: 'slack.png',
		playwright: 'playwright.svg',
		cucumber: 'cucumber.svg'
	};
	$: file = FILES[String(service).toLowerCase()] ?? null;
</script>

{#if file}
	<img
		class="service-icon"
		src="/services-icons/{file}"
		alt={service}
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
