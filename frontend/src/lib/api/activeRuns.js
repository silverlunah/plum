/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

import { API_BASE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

export async function fetchActiveRuns() {
	const res = await fetch(`${API_BASE}/active-runs`, {
		headers: { Authorization: `Bearer ${auth.getToken()}` }
	});
	if (!res.ok) return [];
	const { runs } = await res.json();
	return runs ?? [];
}
