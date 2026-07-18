/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

function authHeaders() {
	return { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.getToken()}` };
}

export async function fetchUsers() {
	const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to fetch users');
	const data = await res.json();
	return data.users;
}

export async function createUser({ name, email, password, role = 'user' }) {
	const res = await fetch(`${API_BASE}/users`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ name, email, password, role })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to create user');
	return data.user;
}

export async function deleteUser(id) {
	const res = await fetch(`${API_BASE}/users/${id}`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	if (!res.ok) {
		const data = await res.json();
		throw new Error(data.error ?? 'Failed to delete user');
	}
}
