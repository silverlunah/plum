/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

function authHeaders() {
	return { Authorization: `Bearer ${auth.getToken()}` };
}

export async function fetchRunners() {
	const res = await fetch(`${API_BASE}/runners`, { headers: authHeaders() });
	if (!res.ok) return [];
	const { runners } = await res.json();
	return runners ?? [];
}

export async function deleteRunner(id) {
	const res = await fetch(`${API_BASE}/runners/${id}`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	return res.json();
}

export async function pingRunner(id) {
	const res = await fetch(`${API_BASE}/runners/${id}/ping`, {
		method: 'POST',
		headers: authHeaders()
	});
	return res.json();
}

export async function stopRunner(id) {
	const res = await fetch(`${API_BASE}/runners/${id}/stop`, {
		method: 'POST',
		headers: authHeaders()
	});
	return res.json();
}

export async function restartRunner(id) {
	const res = await fetch(`${API_BASE}/runners/${id}/restart`, {
		method: 'POST',
		headers: authHeaders()
	});
	return res.json();
}

export async function fetchBuiltInEnabled() {
	const res = await fetch(`${API_BASE}/runners/built-in`, { headers: authHeaders() });
	if (!res.ok) return { builtInRunnerEnabled: true };
	return res.json();
}

export async function setBuiltInEnabled(enabled) {
	const res = await fetch(`${API_BASE}/runners/built-in`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ enabled })
	});
	if (!res.ok) throw new Error('Failed to update built-in runner setting');
	return res.json();
}

export async function fetchNodeSecret() {
	const res = await fetch(`${API_BASE}/runners/node-secret`, { headers: authHeaders() });
	if (!res.ok) return { nodeSecret: null };
	return res.json();
}

export async function regenerateNodeSecret() {
	const res = await fetch(`${API_BASE}/runners/node-secret/regenerate`, {
		method: 'POST',
		headers: authHeaders()
	});
	if (!res.ok) throw new Error('Failed to regenerate the node secret');
	return res.json();
}
