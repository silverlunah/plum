<!--
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
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
			goto(needsSetup ? '/setup' : '/login');
		} catch {
			goto('/login');
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
{/if}
