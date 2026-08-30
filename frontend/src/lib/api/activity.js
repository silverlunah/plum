/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE, ACTIVITY_PER_PAGE } from '$lib/constants';

function authHeaders() {
	return apiHeaders();
}

const EMPTY = { entries: [], total: 0, page: 1, limit: ACTIVITY_PER_PAGE };

function feedPath(scope) {
	return scope === 'org' ? '/activity/org' : '/activity';
}

export async function fetchActivity(scope, { page = 1, action, actorId, q } = {}) {
	const params = new URLSearchParams({ page: String(page), limit: String(ACTIVITY_PER_PAGE) });
	if (action) params.set('action', action);
	if (actorId) params.set('actorId', actorId);
	if (q) params.set('q', q);
	const res = await fetch(`${API_BASE}${feedPath(scope)}?${params}`, { headers: authHeaders() });
	if (!res.ok) return EMPTY;
	return res.json();
}

export async function fetchActivityFilters(scope) {
	const path = scope === 'org' ? '/activity/org/filters' : '/activity/filters';
	const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
	if (!res.ok) return { actions: [], actors: [] };
	return res.json();
}

export async function fetchActivityRetention() {
	const res = await fetch(`${API_BASE}/activity/retention`, { headers: authHeaders() });
	if (!res.ok) return { activityRetentionDays: 90 };
	return res.json();
}

export async function saveActivityRetention(days) {
	const res = await fetch(`${API_BASE}/activity/retention`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ days })
	});
	if (!res.ok) throw new Error('Failed to save retention');
	return res.json();
}
