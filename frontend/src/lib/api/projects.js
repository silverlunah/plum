/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { auth } from '$lib/stores/auth';
import { API_BASE } from '$lib/constants';

function authHeaders({ json = false } = {}) {
	const h = { Authorization: `Bearer ${auth.getToken()}` };
	if (json) h['Content-Type'] = 'application/json';
	return h;
}

export async function fetchProjects() {
	const res = await fetch(`${API_BASE}/projects`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to load projects');
	return (await res.json()).projects;
}

export async function fetchAllProjects() {
	const res = await fetch(`${API_BASE}/projects/all`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to load projects');
	return (await res.json()).projects;
}

export async function createProject({ name, baseUrl }) {
	const res = await fetch(`${API_BASE}/projects`, {
		method: 'POST',
		headers: authHeaders({ json: true }),
		body: JSON.stringify({ name, baseUrl })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to create project');
	return data.project;
}

export async function fetchProjectMembers(id) {
	const res = await fetch(`${API_BASE}/projects/${id}/members`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to load members');
	return (await res.json()).members;
}

export async function setProjectMembers(id, userIds) {
	const res = await fetch(`${API_BASE}/projects/${id}/members`, {
		method: 'PUT',
		headers: authHeaders({ json: true }),
		body: JSON.stringify({ userIds })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to save members');
	return data.members;
}
