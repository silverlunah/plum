/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE } from '$lib/constants';

function authHeaders() {
	return apiHeaders();
}

export async function fetchNotifications() {
	const res = await fetch(`${API_BASE}/notifications`, { headers: authHeaders() });
	if (!res.ok) return { notifications: [], unreadCount: 0 };
	return res.json();
}

export async function markNotificationRead(id) {
	const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
		method: 'POST',
		headers: authHeaders()
	});
	return res.ok;
}

export async function markAllNotificationsRead() {
	const res = await fetch(`${API_BASE}/notifications/read-all`, {
		method: 'POST',
		headers: authHeaders()
	});
	return res.ok;
}
