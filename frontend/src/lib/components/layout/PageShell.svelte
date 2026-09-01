<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<main class="shell">
	<slot />
</main>

<style>
	.shell {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 5rem; /* bottom clearance for RunnerPanel */
	}

	@media (max-width: 1024px) {
		.shell {
			padding: 2rem 1.25rem 5rem;
		}
	}

	@media (max-width: 640px) {
		.shell {
			padding: 1.25rem 1rem 4.5rem;
		}
	}
</style>
