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
	export let browser = 'chromium';
	export let size = 11;
</script>

{#if browser === 'firefox'}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M12 2c0 4.5-5 7-5 12a5 5 0 0 0 10 0c0-5-5-7.5-5-12z" />
		<path d="M12 9c0 2.5-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-3-2.5-4.5-2.5-7z" />
	</svg>
{:else if browser === 'webkit'}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="12" cy="12" r="10" />
		<polygon points="12,5.5 14.5,12 12,10.5 9.5,12" fill="currentColor" stroke="none" />
		<polygon
			points="12,18.5 9.5,12 12,13.5 14.5,12"
			fill="currentColor"
			stroke="none"
			opacity="0.35"
		/>
	</svg>
{:else}
	<!-- chromium -->
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="12" cy="12" r="10" />
		<circle cx="12" cy="12" r="4" />
		<line x1="21.17" y1="8" x2="12" y2="8" />
		<line x1="3.95" y1="6.06" x2="8.54" y2="14" />
		<line x1="10.88" y1="21.94" x2="15.46" y2="14" />
	</svg>
{/if}
