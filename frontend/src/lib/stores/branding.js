/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';
import { fetchBranding } from '$lib/api/auth';

// The org name + logo (and which sign-in methods are on). Held in a store so a
// change in Settings → Organization shows in the navbar without a reload.
export const branding = writable(null);

export async function loadBranding() {
	const data = await fetchBranding();
	if (data) branding.set(data);
	return data;
}

// Merge a partial update (from a settings save) so the navbar reacts at once.
export function patchBranding(patch) {
	branding.update((b) => ({ ...(b ?? {}), ...patch }));
}
