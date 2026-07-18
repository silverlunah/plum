/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';

// A misconfigured or not-yet-routed API URL can accept a connection and never
// respond, rather than refusing outright — a plain fetch() would then hang
// forever with no error to catch. AUTH_TIMEOUT_MS bounds that so the UI always
// resolves one way or another instead of leaving the page blank indefinitely.
const AUTH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

export async function checkNeedsSetup() {
	const res = await fetchWithTimeout(`${API_BASE}/auth/needs-setup`);
	if (!res.ok) return false;
	const data = await res.json();
	return data.needsSetup;
}

export async function setup({ name, email, password }) {
	const res = await fetchWithTimeout(`${API_BASE}/auth/setup`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, email, password })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Setup failed');
	return data;
}

export async function login({ email, password }) {
	const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Login failed');
	return data;
}

export async function updateProfile({ token, name, email }) {
	const res = await fetchWithTimeout(`${API_BASE}/auth/update-profile`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ name, email })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to update profile');
	return data;
}

export async function changePassword({ token, currentPassword, newPassword }) {
	const res = await fetchWithTimeout(`${API_BASE}/auth/change-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ currentPassword, newPassword })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to change password');
	return data;
}
