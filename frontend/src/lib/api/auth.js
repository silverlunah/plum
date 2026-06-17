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

export async function checkNeedsSetup() {
	const res = await fetch(`${API_BASE}/auth/needs-setup`);
	if (!res.ok) return false;
	const data = await res.json();
	return data.needsSetup;
}

export async function setup({ name, email, password }) {
	const res = await fetch(`${API_BASE}/auth/setup`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, email, password })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Setup failed');
	return data;
}

export async function login({ email, password }) {
	const res = await fetch(`${API_BASE}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Login failed');
	return data;
}

export async function updateProfile({ token, name, email }) {
	const res = await fetch(`${API_BASE}/auth/update-profile`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ name, email })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to update profile');
	return data;
}

export async function changePassword({ token, currentPassword, newPassword }) {
	const res = await fetch(`${API_BASE}/auth/change-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ currentPassword, newPassword })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to change password');
	return data;
}
