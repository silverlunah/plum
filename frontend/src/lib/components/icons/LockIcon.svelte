<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	export let size = 12;
	export let strokeWidth = 2;
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	aria-hidden="true"
>
	<rect x="3" y="11" width="18" height="11" rx="2" />
	<path d="M7 11V7a5 5 0 0 1 10 0v4" />
</svg>
