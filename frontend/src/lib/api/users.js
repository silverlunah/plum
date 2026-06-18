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
