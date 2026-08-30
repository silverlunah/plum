/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE } from '$lib/constants';

function authHeaders() {
	return apiHeaders();
}

export async function fetchActiveRuns() {
	// accessibleProjectIds stays null on failure — callers use "not null" to mean
	// "we actually know", so a transient error must not read as "no access".
	const res = await fetch(`${API_BASE}/active-runs`, { headers: authHeaders() });
	if (!res.ok) return { runs: [], accessibleProjectIds: null };
	const data = await res.json();
	return { runs: data.runs ?? [], accessibleProjectIds: data.accessibleProjectIds ?? null };
}
