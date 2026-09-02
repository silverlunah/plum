<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { activeProject } from '$lib/stores/project';

	// `/` is just a router: send the member to whichever page the project has
	// set as its homepage. The real Automated Tests page lives at /automated-tests.
	let done = false;

	function go(project) {
		if (done) return;
		done = true;
		const repo = project?.manualRepositoryOnly || project?.defaultHome === 'repository';
		goto(repo ? '/test-repository' : '/automated-tests', { replaceState: true });
	}

	$: if ($activeProject) go($activeProject);

	onMount(() => {
		// Projects never loaded (offline / error), fall back to Automated Tests.
		const t = setTimeout(() => go(null), 2500);
		return () => clearTimeout(t);
	});
</script>

<div class="redirect-wait" aria-hidden="true"></div>

<style>
	.redirect-wait {
		min-height: 40vh;
	}
</style>
