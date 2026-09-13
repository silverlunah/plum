/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE } from '$lib/constants';

export async function listAiSessions() {
	const res = await fetch(`${API_BASE}/ai-sessions`, { headers: apiHeaders() });
	if (!res.ok) return [];
	return res.json();
}

export async function getAiSession(id) {
	const res = await fetch(`${API_BASE}/ai-sessions/${id}`, { headers: apiHeaders() });
	if (!res.ok) return null;
	return res.json();
}

export async function createAiSession({ provider, title, reportId, runnerIds }) {
	const res = await fetch(`${API_BASE}/ai-sessions`, {
		method: 'POST',
		headers: apiHeaders({ json: true }),
		body: JSON.stringify({ provider, title, reportId, runnerIds })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Failed to start AI session');
	return data;
}

export async function sendAiMessage(id, message) {
	const res = await fetch(`${API_BASE}/ai-sessions/${id}/message`, {
		method: 'POST',
		headers: apiHeaders({ json: true }),
		body: JSON.stringify({ message })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Failed to send message');
	return data;
}

export async function endAiSession(id) {
	const res = await fetch(`${API_BASE}/ai-sessions/${id}`, {
		method: 'DELETE',
		headers: apiHeaders()
	});
	return res.json();
}
