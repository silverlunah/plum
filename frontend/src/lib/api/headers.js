/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { auth } from '$lib/stores/auth';
import { getActiveProjectId } from '$lib/stores/project';

// Auth + active-project headers for every scoped backend call. `json: true`
// adds Content-Type for POST/PUT bodies.
export function apiHeaders({ json = false } = {}) {
	const h = { Authorization: `Bearer ${auth.getToken()}` };
	const projectId = getActiveProjectId();
	if (projectId) h['X-Plum-Project'] = String(projectId);
	if (json) h['Content-Type'] = 'application/json';
	return h;
}
