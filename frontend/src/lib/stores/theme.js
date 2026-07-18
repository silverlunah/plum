/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'plum-theme';
const initial = browser ? (localStorage.getItem(KEY) ?? 'light') : 'light';

export const theme = writable(initial);

theme.subscribe((val) => {
	if (!browser) return;
	localStorage.setItem(KEY, val);
	document.documentElement.setAttribute('data-theme', val);
});
