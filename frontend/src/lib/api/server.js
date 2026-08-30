/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { auth } from '$lib/stores/auth';
import { API_BASE } from '$lib/constants';

export async function checkUpdate() {
	const res = await fetch(`${API_BASE}/server/update`, {
		headers: { Authorization: `Bearer ${auth.getToken()}` }
	});
	if (!res.ok) throw new Error('Failed to check for updates');
	return res.json();
}
