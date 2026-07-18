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
	const { runners } = await res.json();
	return runners;
}

export async function createRunner(data) {
	const res = await fetch(`${API_BASE}/runners`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function deleteRunner(id) {
	const res = await fetch(`${API_BASE}/runners/${id}`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	return res.json();
}

export async function updateRunner(id, data) {
	const res = await fetch(`${API_BASE}/runners/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(data)
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

export async function probeRunner(url, token) {
	const res = await fetch(`${API_BASE}/runners/probe`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ url, token })
	});
	return res.json();
}
