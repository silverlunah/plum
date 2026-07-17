<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Nav from '$lib/components/layout/Nav.svelte';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import RunnerPanel from '$lib/components/layout/RunnerPanel.svelte';
	import { auth } from '$lib/stores/auth';
	import { checkNeedsSetup } from '$lib/api/auth';

	const PUBLIC_ROUTES = ['/login', '/setup'];

	let ready = false;

	onMount(async () => {
		const pathname = $page.url.pathname;
		if (PUBLIC_ROUTES.includes(pathname)) {
			ready = true;
			return;
		}

		const token = $auth.token;
		if (token) {
			ready = true;
			return;
		}

		try {
			const needsSetup = await checkNeedsSetup();
			await goto(needsSetup ? '/setup' : '/login');
		} catch {
			await goto('/login');
		} finally {
			ready = true;
		}
	});
</script>

{#if ready}
	{#if $page.url.pathname === '/login' || $page.url.pathname === '/setup'}
		<slot />
	{:else}
		<Nav />
		<PageShell>
			<slot />
		</PageShell>
		<RunnerPanel />
	{/if}
{:else}
	<div class="boot-loading">Loading…</div>
{/if}

<style>
	.boot-loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
