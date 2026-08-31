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
	import NotificationStack from '$lib/components/ui/NotificationStack.svelte';
	import { auth } from '$lib/stores/auth';
	import { automationHidden } from '$lib/stores/project';
	import { checkNeedsSetup } from '$lib/api/auth';

	const PUBLIC_ROUTES = ['/login', '/setup'];
	// Routes that only make sense with automated testing on — sent to the
	// repository when the active project is manual-only.
	const AUTOMATION_ROUTES = ['/automated-tests', '/reports', '/scheduled-tests', '/live'];

	let ready = false;

	$: onAutomationRoute = AUTOMATION_ROUTES.some(
		(r) => $page.url.pathname === r || $page.url.pathname.startsWith(r + '/')
	);
	$: if (ready && $automationHidden && onAutomationRoute) {
		goto('/test-repository', { replaceState: true });
	}

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
		{#if !$automationHidden}
			<RunnerPanel />
		{/if}
		<NotificationStack />
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
