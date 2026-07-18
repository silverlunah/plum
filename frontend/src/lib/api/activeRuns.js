/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

function authHeaders() {
	return { Authorization: `Bearer ${auth.getToken()}` };
}

export async function fetchActiveRuns() {
	const res = await fetch(`${API_BASE}/active-runs`, { headers: authHeaders() });
	if (!res.ok) return [];
	const { runs } = await res.json();
	return runs ?? [];
}
