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
