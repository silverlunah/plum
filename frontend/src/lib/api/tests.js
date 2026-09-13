/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE } from '$lib/constants';

export async function fetchSuites() {
	const res = await fetch(`${API_BASE}/tests`, { headers: apiHeaders() });
	// `error` is the runner refusing to read the test files, which is not the same
	// as a project with no tests in it yet.
	const { suites, error } = await res.json();
	return { suites: suites ?? [], error: error ?? null };
}
