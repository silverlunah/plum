/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable, derived, get } from 'svelte/store';
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

// The active project's full record (name, logo, homepage mode…), or null until
// the list has loaded. Nav and the automation-surface guards read from here.
export const activeProject = derived(
	[projects, activeProjectId],
	([$projects, $id]) => $projects.find((p) => p.id === $id) ?? $projects[0] ?? null
);

// Automated Tests / Reports / Scheduled and the run bar are hidden when the
// active project is set to manual-repository-only.
export const automationHidden = derived(activeProject, ($p) => $p?.manualRepositoryOnly ?? false);

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
