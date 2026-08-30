/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'plum:project';

function read() {
	if (!browser) return null;
	const n = Number(localStorage.getItem(KEY));
	return Number.isInteger(n) && n > 0 ? n : null;
}

// The project every scoped API call acts on (sent as the X-Plum-Project header).
export const activeProjectId = writable(read());
// The projects the current user can reach — filled by the switcher on load.
export const projects = writable([]);

activeProjectId.subscribe((v) => {
	if (browser && v) localStorage.setItem(KEY, String(v));
});

export function setProjects(list) {
	projects.set(list);
	const current = get(activeProjectId);
	if (!list.some((p) => p.id === current)) {
		activeProjectId.set(list[0]?.id ?? null);
	}
}

export function getActiveProjectId() {
	return get(activeProjectId);
}
