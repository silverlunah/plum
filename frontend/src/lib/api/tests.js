/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';

export async function fetchSuites() {
	const res = await fetch(`${API_BASE}/tests`);
	const { suites } = await res.json();
	return suites.suites ?? [];
}
