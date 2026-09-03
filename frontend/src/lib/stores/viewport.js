/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { readable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { MOBILE_MAX, TABLET_MAX } from '$lib/constants';

// Only for the few spots where JS has to branch on layout mode (e.g. rrweb's
// pixel width), styling stays in CSS media queries.
export const viewportWidth = readable(browser ? window.innerWidth : TABLET_MAX + 1, (set) => {
	if (!browser) return;
	const update = () => set(window.innerWidth);
	window.addEventListener('resize', update, { passive: true });
	window.addEventListener('orientationchange', update);
	return () => {
		window.removeEventListener('resize', update);
		window.removeEventListener('orientationchange', update);
	};
});

export const isMobile = derived(viewportWidth, (w) => w <= MOBILE_MAX);
export const isTablet = derived(viewportWidth, (w) => w > MOBILE_MAX && w <= TABLET_MAX);
// Phone or tablet, the point where multi-column chrome collapses to one column.
export const isCompact = derived(viewportWidth, (w) => w <= TABLET_MAX);
