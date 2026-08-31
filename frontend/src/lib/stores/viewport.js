/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { readable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { MOBILE_MAX, TABLET_MAX } from '$lib/constants';

// Live viewport width. Components use CSS media queries for pure styling; this
// store is only for the few places where the layout *mode* changes (the runner
// panel becoming a sheet, the replay player switching to a tabbed panel).
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
// Touch-first layout (phone or tablet) — the runner panel and players collapse
// their multi-column chrome below this.
export const isCompact = derived(viewportWidth, (w) => w <= TABLET_MAX);
